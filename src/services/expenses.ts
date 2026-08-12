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
  sourceKey?: string;
  createdByTgId: number;
  /** Creates a pending record that does not affect the balance until it is confirmed. */
  pending?: boolean;
  shares: Share[];
};

export type CreateExpenseResult = { expense: Expense; created: boolean };

export function validateShares(amountMinor: number, shares: Share[]): void {
  const sharesTotal = shares.reduce((sum, share) => sum + share.shareMinor, 0);
  if (sharesTotal !== amountMinor) {
    throw new Error('Expense shares must add up to the expense amount');
  }
  if (new Set(shares.map((share) => share.memberId)).size !== shares.length) {
    throw new Error('Expense shares must contain unique members');
  }
}

export function monthDateRange(ym: string): { start: string; end: string } {
  const [year, month] = ym.split('-').map(Number);
  const start = `${ym}-01`;
  const end =
    month === 12 ? `${year! + 1}-01-01` : `${year}-${String(month! + 1).padStart(2, '0')}-01`;
  return { start, end };
}

export async function createExpense(input: NewExpense): Promise<CreateExpenseResult> {
  validateShares(input.amountMinor, input.shares);

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
        sourceKey: input.sourceKey ?? null,
        createdByTgId: input.createdByTgId,
        deletedAt: input.pending ? new Date() : null,
      })
      .onConflictDoNothing()
      .returning();
    if (!created) {
      const sourceCondition = input.sourceKey
        ? eq(expenses.sourceKey, input.sourceKey)
        : input.tgMessageId !== undefined
          ? eq(expenses.tgMessageId, input.tgMessageId)
          : undefined;
      if (!sourceCondition) throw new Error('Expense insert conflicted without an idempotency key');
      const [existing] = await tx
        .select()
        .from(expenses)
        .where(and(eq(expenses.householdId, input.householdId), sourceCondition));
      if (!existing) throw new Error('Conflicting expense could not be loaded');
      return { expense: existing, created: false };
    }
    await tx
      .insert(expenseShares)
      .values(
        input.shares.map((s) => ({ householdId: input.householdId, expenseId: created.id, ...s })),
      );
    return { expense: created, created: true };
  });
}

export async function setReplyMessageId(
  householdId: string,
  id: string,
  tgReplyMessageId: number,
): Promise<void> {
  await db()
    .update(expenses)
    .set({ tgReplyMessageId })
    .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)));
}

export async function getExpense(householdId: string, id: string): Promise<Expense | undefined> {
  const [row] = await db()
    .select()
    .from(expenses)
    .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)));
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

export async function softDeleteExpense(householdId: string, id: string): Promise<void> {
  await db()
    .update(expenses)
    .set({ deletedAt: new Date() })
    .where(
      and(eq(expenses.id, id), eq(expenses.householdId, householdId), isNull(expenses.deletedAt)),
    );
}

export async function restoreExpense(householdId: string, id: string): Promise<void> {
  await db()
    .update(expenses)
    .set({ deletedAt: null })
    .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)));
}

export async function setExpenseCategory(
  householdId: string,
  id: string,
  categoryId: string,
): Promise<void> {
  await db()
    .update(expenses)
    .set({ categoryId })
    .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)));
}

export async function setExpenseSpentOn(
  householdId: string,
  id: string,
  spentOn: string,
): Promise<void> {
  await db()
    .update(expenses)
    .set({ spentOn })
    .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)));
}

export async function updateParsedExpense(
  householdId: string,
  id: string,
  patch: {
    amountMinor: number;
    categoryId: string | null;
    comment: string | null;
    spentOn: string;
    shares: Share[];
  },
): Promise<void> {
  validateShares(patch.amountMinor, patch.shares);
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
      .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)));
    await tx
      .delete(expenseShares)
      .where(and(eq(expenseShares.expenseId, id), eq(expenseShares.householdId, householdId)));
    await tx
      .insert(expenseShares)
      .values(patch.shares.map((s) => ({ householdId, expenseId: id, ...s })));
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

export async function getExpenseRow(
  householdId: string,
  id: string,
): Promise<ExpenseRow | undefined> {
  const [row] = await db()
    .select({ expense: expenses, ...expenseRowSelect })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(members, eq(expenses.payerId, members.id))
    .where(and(eq(expenses.id, id), eq(expenses.householdId, householdId)));
  return row ? toExpenseRow(row) : undefined;
}

export async function listRecentExpenses(
  householdId: string,
  limit: number,
): Promise<ExpenseRow[]> {
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
  const { start, end } = monthDateRange(ym);
  const rows = await db()
    .select({ expense: expenses, ...expenseRowSelect })
    .from(expenses)
    .leftJoin(categories, eq(expenses.categoryId, categories.id))
    .innerJoin(members, eq(expenses.payerId, members.id))
    .where(
      and(
        eq(expenses.householdId, householdId),
        isNull(expenses.deletedAt),
        sql`${expenses.spentOn} >= ${start}`,
        sql`${expenses.spentOn} < ${end}`,
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
      and(
        eq(expenseShares.householdId, householdId),
        inArray(
          expenseShares.expenseId,
          rows.map((r) => r.id),
        ),
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

export async function getShares(householdId: string, expenseId: string): Promise<Share[]> {
  const rows = await db()
    .select()
    .from(expenseShares)
    .where(and(eq(expenseShares.expenseId, expenseId), eq(expenseShares.householdId, householdId)));
  return rows.map((r) => ({ memberId: r.memberId, shareMinor: r.shareMinor }));
}
