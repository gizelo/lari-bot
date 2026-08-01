import type { Api } from 'grammy';
import { InlineKeyboard } from 'grammy';
import { config } from '../config';
import type { Household } from '../db/schema';
import type { Transfer } from '../domain/balance';
import { computeNets, simplifyDebts } from '../domain/balance';
import {
  renderExpenseReply,
  renderPinned,
  type ExpenseView,
  type MemberNames,
} from '../domain/formatting';
import { listActiveCategories } from './categories';
import { setPinnedMessage } from './households';
import { listAllMembers, memberNames } from './members';
import { loadBalanceEntries, type ExpenseRow } from './expenses';

export type BalanceView = { transfers: Transfer[]; names: MemberNames };

export async function balanceView(householdId: string): Promise<BalanceView> {
  const [entries, all] = await Promise.all([
    loadBalanceEntries(householdId),
    listAllMembers(householdId),
  ]);
  return { transfers: simplifyDebts(computeNets(entries)), names: memberNames(all) };
}

export function toExpenseView(row: ExpenseRow): ExpenseView {
  return {
    amountMinor: row.amountMinor,
    kind: row.kind,
    comment: row.comment,
    spentOn: row.spentOn,
    deleted: row.deletedAt !== null,
    payerId: row.payerId,
    categoryName: row.categoryName,
    categoryEmoji: row.categoryEmoji,
  };
}

export async function categoryPickerKeyboard(
  expenseIdForBack?: string,
): Promise<InlineKeyboard> {
  const cats = await listActiveCategories();
  const kb = new InlineKeyboard();
  cats.forEach((c, i) => {
    kb.text(`${c.emoji ? `${c.emoji} ` : ''}${c.name}`, `cs:${c.id}`);
    if (i % 2 === 1) kb.row();
  });
  kb.row();
  if (expenseIdForBack) kb.text('⬅️ Назад', `cb:${expenseIdForBack}`);
  return kb;
}

export async function expenseKeyboard(row: ExpenseRow): Promise<InlineKeyboard> {
  if (row.deletedAt !== null) return new InlineKeyboard().text('↩️ Вернуть', `r:${row.id}`);
  if (row.kind === 'settlement') return new InlineKeyboard().text('🗑 Удалить', `d:${row.id}`);
  if (!row.categoryId) {
    const kb = await categoryPickerKeyboard();
    return kb.text('🗑 Удалить', `d:${row.id}`);
  }
  return new InlineKeyboard()
    .text('🏷 Категория', `c:${row.id}`)
    .text('🗑 Удалить', `d:${row.id}`);
}

export async function renderExpenseMessage(
  row: ExpenseRow,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const { transfers, names } = await balanceView(row.householdId);
  const text = renderExpenseReply(toExpenseView(row), names, transfers, config().CURRENCY_SYMBOL);
  return { text, keyboard: await expenseKeyboard(row) };
}

/** Перерисовывает ответное сообщение бота под расходом (после любой мутации). */
export async function refreshExpenseReply(
  api: Api,
  tgChatId: number,
  row: ExpenseRow,
): Promise<void> {
  if (!row.tgReplyMessageId) return;
  const { text, keyboard } = await renderExpenseMessage(row);
  try {
    await api.editMessageText(tgChatId, row.tgReplyMessageId, text, {
      parse_mode: 'HTML',
      reply_markup: keyboard,
    });
  } catch (err) {
    if (!String(err).includes('message is not modified')) throw err;
  }
}

/** Держит в чате одно сообщение с актуальным балансом (закреп). */
export async function updatePinnedBalance(api: Api, household: Household): Promise<void> {
  const { transfers, names } = await balanceView(household.id);
  const cfg = config();
  const text = renderPinned(transfers, names, cfg.CURRENCY_SYMBOL, cfg.TZ);

  if (household.pinnedMessageId) {
    try {
      await api.editMessageText(household.tgChatId, household.pinnedMessageId, text, {
        parse_mode: 'HTML',
      });
      return;
    } catch (err) {
      if (String(err).includes('message is not modified')) return;
      // Сообщение удалили — создаём новое ниже.
    }
  }

  try {
    const sent = await api.sendMessage(household.tgChatId, text, { parse_mode: 'HTML' });
    await setPinnedMessage(household.id, sent.message_id);
    household.pinnedMessageId = sent.message_id;
    // Закрепить сможем только с правами админа — иначе пусть закрепят вручную.
    await api.pinChatMessage(household.tgChatId, sent.message_id, {
      disable_notification: true,
    });
  } catch {
    // Нет прав на закреп или отправку — не мешаем основному сценарию.
  }
}
