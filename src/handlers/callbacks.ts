import { Composer, type Context } from 'grammy';
import {
  findByReplyMessageId,
  getExpenseRow,
  restoreExpense,
  setExpenseCategory,
  softDeleteExpense,
} from '../services/expenses';
import { getOrCreateHousehold } from '../services/households';
import { deactivateMember, ensureMember } from '../services/members';
import {
  categoryPickerKeyboard,
  refreshExpenseReply,
  updatePinnedBalance,
} from '../services/render';
import { displayName } from './expense';
import { renderMembersPanel } from './membership';

export const callbacksComposer = new Composer();

async function household(ctx: Context) {
  return getOrCreateHousehold(ctx.chat!.id, ctx.chat!.title ?? 'Группа');
}

async function refreshAfterMutation(ctx: Context, expenseId: string): Promise<void> {
  const hh = await household(ctx);
  const row = await getExpenseRow(expenseId);
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
  await softDeleteExpense(ctx.match[1]!);
  await ctx.answerCallbackQuery({ text: 'Удалено' });
  await refreshAfterMutation(ctx, ctx.match[1]!);
});

callbacksComposer.callbackQuery(/^(?:r|ok):(.+)$/, async (ctx) => {
  await restoreExpense(ctx.match[1]!);
  await ctx.answerCallbackQuery({ text: 'Записано ✅' });
  await refreshAfterMutation(ctx, ctx.match[1]!);
});

// Отмена подтверждения крупной суммы: запись так и остаётся не влияющей на баланс.
callbacksComposer.callbackQuery(/^x:(.+)$/, async (ctx) => {
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

// Выбор категории: расход находим по ответному сообщению бота, на котором кнопки.
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
  await setExpenseCategory(expense.id, ctx.match[1]!);
  await ctx.answerCallbackQuery({ text: 'Категория обновлена' });
  await refreshAfterMutation(ctx, expense.id);
});
