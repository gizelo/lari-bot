import { Composer, type Context } from 'grammy';
import { isValidIsoDate } from '../domain/dates.js';
import {
  findByReplyMessageId,
  getExpenseRow,
  restoreExpense,
  setExpenseCategory,
  setExpenseSpentOn,
  softDeleteExpense,
} from '../services/expenses.js';
import { getCategory } from '../services/categories.js';
import { getOrCreateHousehold } from '../services/households.js';
import { deactivateMember, ensureMember } from '../services/members.js';
import {
  categoryPickerKeyboard,
  datePickerKeyboard,
  refreshExpenseReply,
  updatePinnedBalance,
} from '../services/render.js';
import { displayName } from './expense.js';
import { renderMembersPanel } from './membership.js';

export const callbacksComposer = new Composer();

async function household(ctx: Context) {
  return getOrCreateHousehold(ctx.chat!.id, ctx.chat!.title ?? 'Группа');
}

async function refreshAfterMutation(ctx: Context, expenseId: string): Promise<void> {
  const hh = await household(ctx);
  const row = await getExpenseRow(hh.id, expenseId);
  if (row) await refreshExpenseReply(ctx.api, hh.tgChatId, row);
  await updatePinnedBalance(ctx.api, hh);
}

async function refreshMembersPanel(ctx: Context): Promise<void> {
  const hh = await household(ctx);
  const { text, keyboard } = await renderMembersPanel(hh);
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
}

callbacksComposer.callbackQuery('j', async (ctx) => {
  const hh = await household(ctx);
  await ensureMember(hh.id, ctx.from.id, displayName(ctx.from));
  await ctx.answerCallbackQuery({ text: 'Ты участвуешь в дележе ✅' });
  await refreshMembersPanel(ctx);
});

callbacksComposer.callbackQuery('lv', async (ctx) => {
  const hh = await household(ctx);
  await deactivateMember(hh.id, ctx.from.id);
  await ctx.answerCallbackQuery({ text: 'Новые расходы на тебя не делятся. Долги остались.' });
  await refreshMembersPanel(ctx);
});

callbacksComposer.callbackQuery(/^d:(.+)$/, async (ctx) => {
  const hh = await household(ctx);
  await softDeleteExpense(hh.id, ctx.match[1]!);
  await ctx.answerCallbackQuery({ text: 'Удалено' });
  await refreshAfterMutation(ctx, ctx.match[1]!);
});

callbacksComposer.callbackQuery(/^(?:r|ok):(.+)$/, async (ctx) => {
  const hh = await household(ctx);
  await restoreExpense(hh.id, ctx.match[1]!);
  await ctx.answerCallbackQuery({ text: 'Записано ✅' });
  await refreshAfterMutation(ctx, ctx.match[1]!);
});

// Cancelling a large amount leaves the pending record excluded from the balance.
callbacksComposer.callbackQuery(/^x:(.+)$/, async (ctx) => {
  const hh = await household(ctx);
  await softDeleteExpense(hh.id, ctx.match[1]!);
  await ctx.answerCallbackQuery({ text: 'Отменено' });
  await ctx.editMessageText('Запись отменена.').catch(() => {});
});

callbacksComposer.callbackQuery(/^c:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  const hh = await household(ctx);
  const kb = await categoryPickerKeyboard(hh.id, ctx.match[1]!);
  await ctx.editMessageReplyMarkup({ reply_markup: kb }).catch(() => {});
});

callbacksComposer.callbackQuery(/^cb:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await refreshAfterMutation(ctx, ctx.match[1]!);
});

callbacksComposer.callbackQuery(/^dp:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await ctx
    .editMessageReplyMarkup({ reply_markup: datePickerKeyboard(ctx.match[1]!) })
    .catch(() => {});
});

// Resolve the expense from the bot reply that owns the date buttons.
callbacksComposer.callbackQuery(/^dd:(\d{4}-\d{2}-\d{2})$/, async (ctx) => {
  const spentOn = ctx.match[1]!;
  if (!isValidIsoDate(spentOn)) {
    await ctx.answerCallbackQuery({ text: 'Некорректная дата' });
    return;
  }
  const messageId = ctx.callbackQuery.message?.message_id;
  if (!messageId) {
    await ctx.answerCallbackQuery({ text: 'Сообщение недоступно' });
    return;
  }
  const hh = await household(ctx);
  const expense = await findByReplyMessageId(hh.id, messageId);
  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Запись не найдена' });
    return;
  }
  await setExpenseSpentOn(hh.id, expense.id, spentOn);
  await ctx.answerCallbackQuery({ text: 'Дата обновлена' });
  await refreshAfterMutation(ctx, expense.id);
});

// Resolve the expense from the bot reply that owns the category buttons.
callbacksComposer.callbackQuery(/^cs:(.+)$/, async (ctx) => {
  const messageId = ctx.callbackQuery.message?.message_id;
  if (!messageId) {
    await ctx.answerCallbackQuery({ text: 'Сообщение недоступно' });
    return;
  }
  const hh = await household(ctx);
  const expense = await findByReplyMessageId(hh.id, messageId);
  if (!expense) {
    await ctx.answerCallbackQuery({ text: 'Запись не найдена' });
    return;
  }
  const category = await getCategory(hh.id, ctx.match[1]!);
  if (!category) {
    await ctx.answerCallbackQuery({ text: 'Категория не найдена' });
    return;
  }
  await setExpenseCategory(hh.id, expense.id, category.id);
  await ctx.answerCallbackQuery({ text: 'Категория обновлена' });
  await refreshAfterMutation(ctx, expense.id);
});
