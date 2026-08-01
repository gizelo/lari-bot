export type BalanceEntry = {
  payerId: string;
  amountMinor: number;
  deleted: boolean;
  shares: { memberId: string; shareMinor: number }[];
};

export type Transfer = { fromId: string; toId: string; amountMinor: number };

/**
 * Нетто-баланс участника: сколько заплатил минус его доли.
 * Положительный — ему должны, отрицательный — он должен.
 * Формула едина для expense и settlement: у settlement одна «доля» —
 * получатель перевода на полную сумму.
 */
export function computeNets(entries: BalanceEntry[]): Map<string, number> {
  const nets = new Map<string, number>();
  const add = (id: string, delta: number) => nets.set(id, (nets.get(id) ?? 0) + delta);

  for (const e of entries) {
    if (e.deleted) continue;
    add(e.payerId, e.amountMinor);
    for (const s of e.shares) add(s.memberId, -s.shareMinor);
  }
  return nets;
}

/** Жадное сведение нетто-балансов к минимальному списку переводов «кто кому сколько». */
export function simplifyDebts(nets: Map<string, number>): Transfer[] {
  const byAmountDesc = (a: { amount: number }, b: { amount: number }) => b.amount - a.amount;
  const debtors = [...nets.entries()]
    .filter(([, n]) => n < 0)
    .map(([id, n]) => ({ id, amount: -n }))
    .sort(byAmountDesc);
  const creditors = [...nets.entries()]
    .filter(([, n]) => n > 0)
    .map(([id, n]) => ({ id, amount: n }))
    .sort(byAmountDesc);

  const transfers: Transfer[] = [];
  let d = 0;
  let c = 0;
  while (d < debtors.length && c < creditors.length) {
    const debtor = debtors[d]!;
    const creditor = creditors[c]!;
    const amount = Math.min(debtor.amount, creditor.amount);
    transfers.push({ fromId: debtor.id, toId: creditor.id, amountMinor: amount });
    debtor.amount -= amount;
    creditor.amount -= amount;
    if (debtor.amount === 0) d++;
    if (creditor.amount === 0) c++;
  }
  return transfers;
}
