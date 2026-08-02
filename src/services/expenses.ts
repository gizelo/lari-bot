import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import type { BalanceEntry } from '../domain/balance.js';
import type { Share } from '../domain/split.js';
import { db } from '../db/client.js';
import { categories, expenseShares, expenses, members, type Expense } from '../db/schema.js';

export type NewExpense = {
  householdId: string;
  kind: 'expense' | 'settlement';
  categoryId: string | null;
  payerId: string;
  amountMinor: number;
  comment: string | null;
  spentOn: string;
  tgMessageId?: number;
  createdByTgId: number;
  /** true — запись создаётся «на паузе» (ожидает подтверждения) и не влияет на баланс. */
  pending?: boolean;
  shares: Share[];
};

/** null — дубль (повторная доставка апдейта с тем же tg_message_id). */
export async function createExpense(input: NewExpense): Promise<Expense | null> {
  return db().transaction(async (tx) => {
    const [created] = await tx
      .insert(expenses)
      .values({
        householdId: input.householdId,
        kind: input.kind,
        categoryId: input.categoryId,
        payerId: input.payerId,
        amountMinor: input.amountMinor,
        comment: input.comment,
        spentOn: input.spentOn,
        tgMessageId: input.tgMessageId ?? null,
        createdByTgId: input.createdByTgId,
        deletedAt: input.pending ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) return null;
    await tx
      .insert(expenseShares)
      .values(input.shares.map((s) => ({ expenseId: created.id, ...s })));
    return created;
  });
}

export async function setReplyMessageId(id: string, tgReplyMessageId: number): Promise<void> {
  await db().update(expenses).set({ tgReplyMessageId }).where(eq(expenses.id, id));
}

export async function getExpense(id: string): Promise<Expense | undefined> {
  const [row] = await db().select().from(expenses).where(eq(expenses.id, id));
  return row;
}

export async function findByMessageId(
  householdId: string,
  tgMessageId: number,
): Promise<Expense | undefined> {
  const [row] = await db()
    .select()
    .from(expenses)
    .where(and(eq(expenses.householdId, householdId), eq(expenses.tgMessageId, tgMessageId)));
  return row;
}

export async function findByReplyMessageId(
  householdId: string,
  tgReplyMessageId: number,
): Promise<Expense | undefined> {
  const [row] = await db()
    .select()
    .from(expenses)
    .where(
      and(eq(expenses.householdId, householdId), eq(expenses.tgReplyMessageId, tgReplyMessageId)),
    );
  return row;
}

export async function softDeleteExpense(id: string): Promise<void> {
  await db().update(expenses).set({ deletedAt: new Date() }).where(eq(expenses.id, id));
}

export async function restoreExpense(id: string): Promise<void> {
  await db().update(expenses).set({ deletedAt: null }).where(eq(expenses.id, id));
}

export async function setExpenseCategory(id: string, categoryId: string): Promise<void> {
  await db().update(expenses).set({ categoryId }).where(eq(expenses.id, id));
}

export async function setExpenseSpentOn(id: string, spentOn: string): Promise<void> {
  await db().update(expenses).set({ spentOn }).where(eq(expenses.id, id));
}

export async function updateParsedExpense(
  id: string,
  patch: {
    amountMinor: number;
    categoryId: string | null;
    comment: string | null;
    spentOn: string;
    shares: Share[];
  },
): Promise<void> {
  await db().transaction(async (tx) => {
    await tx
      .update(expenses)
      .set({
        amountMinor: patch.amountMinor,
        categoryId: patch.categoryId,
        comment: patch.comment,
        spentOn: patch.spentOn,
        deletedAt: null,
      })
      .where(eq(expenses.id, id));
    await tx.delete(expenseShares).where(eq(expenseShares.expenseId, id));
    await tx.insert(expenseShares).values(patch.shares.map((s) => ({ expenseId: id, ...s })));
  });
}

export type ExpenseRow = Expense & {
  categoryName: string | null;
  categoryEmoji: string | null;
  payerName: string;
};

const expenseRowSelect = {
  categoryName: categories.name,
  categoryEmoji: categories.emoji,
  payerName: members.displayName,
};

function toExpenseRow(r: {
  expense: Expense;
  categoryName: string | null;
  categoryEmoji: string | null;
  payerName: string;
}): ExpenseRow {
  return {
    ...r.expense,
    categoryName: r.categoryName,
    categoryEmoji: r.categoryEmoji,
    payerName: r.payerName,
  };
}

export async function getExpenseRow(id: string): Promise<ExpenseRow | undefined> {
  const [row] = await db()
    .select({ expense: expenses, ...expenseRowSelect })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(members, eq(expenses.payerId, members.id))
    .where(eq(expenses.id, id));
  return row ? toExpenseRow(row) : undefined;
}

export async function listRecentExpenses(householdId: string, limit: number): Promise<ExpenseRow[]> {
  const rows = await db()
    .select({ expense: expenses, ...expenseRowSelect })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(members, eq(expenses.payerId, members.id))
    .where(and(eq(expenses.householdId, householdId), isNull(expenses.deletedAt)))
    .orderBy(desc(expenses.spentOn), desc(expenses.createdAt))
    .limit(limit);
  return rows.map(toExpenseRow);
}

export async function listMonthExpenses(householdId: string, ym: string): Promise<ExpenseRow[]> {
  const rows = await db()
    .select({ expense: expenses, ...expenseRowSelect })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(members, eq(expenses.payerId, members.id))
    .where(
      and(
        eq(expenses.householdId, householdId),
        isNull(expenses.deletedAt),
        sql`to_char(${expenses.spentOn}, 'YYYY-MM') = ${ym}`,
      ),
    )
    .orderBy(expenses.spentOn);
  return rows.map(toExpenseRow);
}

export async function listAllExpenses(householdId: string): Promise<ExpenseRow[]> {
  const rows = await db()
    .select({ expense: expenses, ...expenseRowSelect })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(members, eq(expenses.payerId, members.id))
    .where(and(eq(expenses.householdId, householdId), isNull(expenses.deletedAt)))
    .orderBy(expenses.spentOn, expenses.createdAt);
  return rows.map(toExpenseRow);
}

export async function loadBalanceEntries(householdId: string): Promise<BalanceEntry[]> {
  const rows = await db()
    .select({ id: expenses.id, payerId: expenses.payerId, amountMinor: expenses.amountMinor })
    .from(expenses)
    .where(and(eq(expenses.householdId, householdId), isNull(expenses.deletedAt)));
  if (rows.length === 0) return [];

  const shares = await db()
    .select()
    .from(expenseShares)
    .where(
      inArray(
        expenseShares.expenseId,
        rows.map((r) => r.id),
      ),
    );
  const byExpense = new Map<string, { memberId: string; shareMinor: number }[]>();
  for (const s of shares) {
    const list = byExpense.get(s.expenseId) ?? [];
    list.push({ memberId: s.memberId, shareMinor: s.shareMinor });
    byExpense.set(s.expenseId, list);
  }
  return rows.map((r) => ({
    payerId: r.payerId,
    amountMinor: r.amountMinor,
    deleted: false,
    shares: byExpense.get(r.id) ?? [],
  }));
}

export async function getShares(expenseId: string): Promise<Share[]> {
  const rows = await db()
    .select()
    .from(expenseShares)
    .where(eq(expenseShares.expenseId, expenseId));
  return rows.map((r) => ({ memberId: r.memberId, shareMinor: r.shareMinor }));
}
