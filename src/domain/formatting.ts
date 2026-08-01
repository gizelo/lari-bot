import type { Transfer } from './balance';
import { formatMoney } from './money';

// Все сообщения бота — HTML parse mode; пользовательский текст всегда через esc().
export function esc(s: string): string {
  return s.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

export type MemberNames = Map<string, string>;

const name = (names: MemberNames, id: string) => esc(names.get(id) ?? '???');

export function renderTransfers(
  transfers: Transfer[],
  names: MemberNames,
  symbol: string,
): string {
  if (transfers.length === 0) return 'Вы в расчёте 🎉';
  return transfers
    .map(
      (t) => `${name(names, t.fromId)} → ${name(names, t.toId)}: ${formatMoney(t.amountMinor, symbol)}`,
    )
    .join('\n');
}

export type ExpenseView = {
  amountMinor: number;
  kind: 'expense' | 'settlement';
  comment: string | null;
  spentOn: string;
  deleted: boolean;
  payerId: string;
  categoryName: string | null;
  categoryEmoji: string | null;
};

function categoryLabel(view: ExpenseView): string | null {
  if (!view.categoryName) return null;
  return view.categoryEmoji
    ? `${view.categoryEmoji} ${esc(view.categoryName)}`
    : esc(view.categoryName);
}

export function renderExpenseReply(
  view: ExpenseView,
  names: MemberNames,
  transfers: Transfer[],
  symbol: string,
): string {
  const payer = name(names, view.payerId);
  const money = formatMoney(view.amountMinor, symbol);

  if (view.kind === 'settlement') {
    const to = view.comment ? ` → ${esc(view.comment)}` : '';
    const head = view.deleted
      ? `<s>💸 Расчёт ${money}</s> отменён`
      : `💸 Рассчитались: ${payer}${to} ${money}`;
    return `${head}\n\n⚖️ ${renderTransfers(transfers, names, symbol)}`;
  }

  const cat = categoryLabel(view);
  const headParts = [money, ...(cat ? [cat] : []), payer];
  if (view.deleted) {
    return `<s>${money}${cat ? ` · ${cat}` : ''}</s> удалено`;
  }
  const lines = [`✅ ${headParts.join(' · ')}`];
  if (view.comment) lines.push(esc(view.comment));
  if (!view.categoryName) lines.push('Категория?');
  lines.push('', `⚖️ ${renderTransfers(transfers, names, symbol)}`);
  return lines.join('\n');
}

export function renderConfirmRequest(view: ExpenseView, symbol: string): string {
  return `Сумма ${formatMoney(view.amountMinor, symbol)} — это правда? Подтверди или отмени.`;
}

export function renderPinned(
  transfers: Transfer[],
  names: MemberNames,
  symbol: string,
  timeZone: string,
): string {
  const now = new Intl.DateTimeFormat('ru-RU', {
    timeZone,
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
  }).format(new Date());
  return `⚖️ <b>Баланс</b>\n${renderTransfers(transfers, names, symbol)}\n\n<i>Обновлено ${now}</i>`;
}
