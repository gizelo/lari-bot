import { Composer, InlineKeyboard, type Context } from 'grammy';
import { config } from '../config.js';
import { todayIn } from '../domain/dates.js';
import { renderConfirmRequest } from '../domain/formatting.js';
import { parseExpense, type ParsedExpense } from '../domain/parser.js';
import { splitEqually } from '../domain/split.js';
import { listActiveCategories } from '../services/categories.js';
import { createExpense, getExpenseRow, setReplyMessageId } from '../services/expenses.js';
import { getOrCreateHousehold } from '../services/households.js';
import { ensureMember, listActiveMembers, touchDisplayName } from '../services/members.js';
import { renderExpenseMessage, toExpenseView, updatePinnedBalance } from '../services/render.js';

export function displayName(from: { first_name: string; username?: string }): string {
  return from.first_name || from.username || 'Без имени';
}

export async function parseGroupMessage(
  householdId: string,
  text: string,
): Promise<ParsedExpense | null> {
  const categories = await listActiveCategories(householdId);
  return parseExpense(
    text,
    categories.map((c) => ({ id: c.id, name: c.name, aliases: c.aliases })),
    todayIn(config().TZ),
  );
}

/** Shared path for new messages and edits without an existing expense. */
export async function handleNewExpense(
  ctx: Context,
  messageId: number,
  text: string,
): Promise<void> {
  const chat = ctx.chat;
  const from = ctx.from;
  if (!chat || !from || from.is_bot) return;

  const household = await getOrCreateHousehold(chat.id, chat.title ?? 'Группа');
  const parsed = await parseGroupMessage(household.id, text);
  if (!parsed) return; // Ignore messages that are not expenses.

  const payer = await ensureMember(household.id, from.id, displayName(from));
  const active = await listActiveMembers(household.id);
  const shares = splitEqually(
    parsed.amountMinor,
    active.map((m) => m.id),
    payer.id,
  );

  const result = await createExpense({
    householdId: household.id,
    kind: 'expense',
    categoryId: parsed.categoryId,
    payerId: payer.id,
    amountMinor: parsed.amountMinor,
    comment: parsed.comment,
    spentOn: parsed.spentOn,
    tgMessageId: messageId,
    sourceKey: `message:${chat.id}:${messageId}`,
    createdByTgId: from.id,
    pending: parsed.needsConfirmation,
    shares,
  });
  const created = result.expense;
  if (!result.created && created.tgReplyMessageId) {
    await updatePinnedBalance(ctx.api, household);
    return;
  }

  if (created.deletedAt) {
    const row = (await getExpenseRow(household.id, created.id))!;
    const reply = await ctx.api.sendMessage(
      chat.id,
      renderConfirmRequest(toExpenseView(row), config().CURRENCY_SYMBOL),
      {
        reply_parameters: { message_id: messageId },
        reply_markup: new InlineKeyboard()
          .text('✅ Да, всё верно', `ok:${created.id}`)
          .text('✖️ Отмена', `x:${created.id}`),
      },
    );
    await setReplyMessageId(household.id, created.id, reply.message_id);
    return;
  }

  const row = (await getExpenseRow(household.id, created.id))!;
  const { text: replyText, keyboard } = await renderExpenseMessage(row);
  const reply = await ctx.api.sendMessage(chat.id, replyText, {
    parse_mode: 'HTML',
    reply_parameters: { message_id: messageId },
    reply_markup: keyboard,
  });
  await setReplyMessageId(household.id, created.id, reply.message_id);
  await updatePinnedBalance(ctx.api, household);
}

export const expenseComposer = new Composer();

expenseComposer.on('message:text', async (ctx) => {
  const text = ctx.message.text;
  if (text.startsWith('/')) return;
  // Keep the member's display name current even when the message is not an expense.
  const household = await getOrCreateHousehold(ctx.chat.id, ctx.chat.title ?? 'Группа');
  if (ctx.from && !ctx.from.is_bot) {
    await touchDisplayName(household.id, ctx.from.id, displayName(ctx.from));
  }
  await handleNewExpense(ctx, ctx.message.message_id, text);
});
