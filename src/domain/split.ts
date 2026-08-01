export type Share = { memberId: string; shareMinor: number };

/**
 * Деление поровну на N участников. Остаток тетри раздаётся по +1 детерминированно:
 * сначала плательщику, затем остальным в порядке передачи (по created_at участника).
 * Для двоих с нечётной суммой плательщик платит на 1 тетри больше.
 */
export function splitEqually(
  amountMinor: number,
  memberIds: string[],
  payerId: string,
): Share[] {
  if (memberIds.length === 0) throw new Error('splitEqually: пустой список участников');
  const n = memberIds.length;
  const base = Math.floor(amountMinor / n);
  let remainder = amountMinor - base * n;

  const ordered = memberIds.includes(payerId)
    ? [payerId, ...memberIds.filter((id) => id !== payerId)]
    : [...memberIds];

  const extra = new Map<string, number>();
  for (const id of ordered) {
    if (remainder <= 0) break;
    extra.set(id, 1);
    remainder--;
  }

  return memberIds.map((memberId) => ({
    memberId,
    shareMinor: base + (extra.get(memberId) ?? 0),
  }));
}
