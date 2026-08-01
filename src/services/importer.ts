import { and, eq, isNull } from 'drizzle-orm';
import { db } from '../db/client';
import { expenses } from '../db/schema';
import type { CsvExpense } from '../domain/csv';
import { splitEqually } from '../domain/split';
import { createCategory, listAllCategories } from './categories';
import { createExpense } from './expenses';
import { listActiveMembers } from './members';

export type ImportResult = {
  inserted: number;
  skippedDuplicates: number;
  createdCategories: string[];
  unknownPayers: string[];
};

const norm = (s: string) => s.trim().toLowerCase().replaceAll('ё', 'е');

/** Ключ идемпотентности: повторный импорт того же файла не создаёт дублей. */
const dupKey = (spentOn: string, amountMinor: number, payerId: string, comment: string | null) =>
  `${spentOn}|${amountMinor}|${payerId}|${comment ?? ''}`;

export function matchPayers(
  rows: CsvExpense[],
  members: { id: string; displayName: string }[],
  manual: Map<string, string>,
): { map: Map<string, string>; unknown: string[] } {
  const map = new Map<string, string>();
  const unknown: string[] = [];
  for (const name of new Set(rows.map((r) => r.payerName))) {
    const n = norm(name);
    const manualId = manual.get(n);
    if (manualId) {
      map.set(n, manualId);
      continue;
    }
    const exact = members.find((m) => norm(m.displayName) === n);
    const prefix = members.filter(
      (m) => norm(m.displayName).startsWith(n.slice(0, 3)) && n.length >= 3,
    );
    const found = exact ?? (prefix.length === 1 ? prefix[0] : undefined);
    if (found) map.set(n, found.id);
    else unknown.push(name);
  }
  return { map, unknown };
}

export async function importCsvRows(
  householdId: string,
  createdByTgId: number,
  rows: CsvExpense[],
  manualPayerMap: Map<string, string>,
): Promise<ImportResult> {
  const activeMembers = await listActiveMembers(householdId);
  const { map: payerMap, unknown } = matchPayers(rows, activeMembers, manualPayerMap);
  if (unknown.length > 0) {
    return { inserted: 0, skippedDuplicates: 0, createdCategories: [], unknownPayers: unknown };
  }

  const cats = await listAllCategories();
  const catByAlias = new Map<string, string>();
  for (const c of cats) {
    catByAlias.set(norm(c.name), c.id);
    for (const a of c.aliases) catByAlias.set(norm(a), c.id);
  }

  const existing = await db()
    .select({
      spentOn: expenses.spentOn,
      amountMinor: expenses.amountMinor,
      payerId: expenses.payerId,
      comment: expenses.comment,
    })
    .from(expenses)
    .where(and(eq(expenses.householdId, householdId), isNull(expenses.deletedAt)));
  const seen = new Set(existing.map((e) => dupKey(e.spentOn, e.amountMinor, e.payerId, e.comment)));

  const createdCategories: string[] = [];
  let inserted = 0;
  let skippedDuplicates = 0;
  const memberIds = activeMembers.map((m) => m.id);

  for (const row of rows) {
    const payerId = payerMap.get(norm(row.payerName))!;
    const key = dupKey(row.spentOn, row.amountMinor, payerId, row.comment);
    if (seen.has(key)) {
      skippedDuplicates++;
      continue;
    }

    let categoryId = catByAlias.get(norm(row.categoryName));
    if (!categoryId) {
      const created = await createCategory(row.categoryName.trim());
      if (created) {
        categoryId = created.id;
        catByAlias.set(norm(created.name), created.id);
        createdCategories.push(created.name);
      }
    }

    await createExpense({
      householdId,
      kind: 'expense',
      categoryId: categoryId ?? null,
      payerId,
      amountMinor: row.amountMinor,
      comment: row.comment,
      spentOn: row.spentOn,
      createdByTgId,
      shares: splitEqually(row.amountMinor, memberIds, payerId),
    });
    seen.add(key);
    inserted++;
  }

  return { inserted, skippedDuplicates, createdCategories, unknownPayers: [] };
}
