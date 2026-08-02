import { Composer, InlineKeyboard } from 'grammy';
import { config } from '../config.js';
import { renderConfirmRequest } from '../domain/formatting.js';
import { splitEqually } from '../domain/split.js';
import {
  findByMessageId,
  getExpenseRow,
  getShares,
  softDeleteExpense,
  updateParsedExpense,
} from '../services/expenses.js';
import { getOrCreateHousehold } from '../services/households.js';
import { handleNewExpense, parseGroupMessage } from './expense.js';
import {
  refreshExpenseReply,
  toExpenseView,
  updatePinnedBalance,
} from '../services/render.js';

export const editComposer = new Composer();

editComposer.on('edited_message:text', async (ctx) => {
  const text = ctx.editedMessage.text;
  if (text.startsWith('/')) return;

  const household = await getOrCreateHousehold(ctx.chat.id, ctx.chat.title ?? 'Группа');
  const existing = await findByMessageId(household.id, ctx.editedMessage.message_id);

  if (!existing) {
    // Сообщение стало расходом только после правки — заводим запись как новую.
    await handleNewExpense(ctx, ctx.editedMessage.message_id, text);
    return;
  }
  if (existing.kind !== 'expense') return;

  const parsed = await parseGroupMessage(household.id, text);

  if (!parsed) {
    await softDeleteExpense(existing.id);
    if (existing.tgReplyMessageId) {
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          existing.tgReplyMessageId,
          'Сообщение изменено и больше не похоже на расход — запись удалена.',
          { reply_markup: new InlineKeyboard().text('↩️ Вернуть', `r:${existing.id}`) },
        )
        .catch(() => {});
    }
    await updatePinnedBalance(ctx.api, household);
    return;
  }

  // Состав дележа — снапшот исходной записи; правка меняет только сумму и атрибуты.
  const participantIds = (await getShares(existing.id)).map((s) => s.memberId);
  await updateParsedExpense(existing.id, {
    amountMinor: parsed.amountMinor,
    categoryId: parsed.categoryId,
    comment: parsed.comment,
    spentOn: parsed.spentOn,
    shares: splitEqually(parsed.amountMinor, participantIds, existing.payerId),
  });

  if (parsed.needsConfirmation) {
    await softDeleteExpense(existing.id);
    if (existing.tgReplyMessageId) {
      const row = (await getExpenseRow(existing.id))!;
      await ctx.api
        .editMessageText(
          ctx.chat.id,
          existing.tgReplyMessageId,
          renderConfirmRequest(toExpenseView(row), config().CURRENCY_SYMBOL),
          {
            reply_markup: new InlineKeyboard()
              .text('✅ Да, всё верно', `ok:${existing.id}`)
              .text('✖️ Отмена', `x:${existing.id}`),
          },
        )
        .catch(() => {});
    }
    await updatePinnedBalance(ctx.api, household);
    return;
  }

  const row = (await getExpenseRow(existing.id))!;
  await refreshExpenseReply(ctx.api, ctx.chat.id, row);
  await updatePinnedBalance(ctx.api, household);
});
