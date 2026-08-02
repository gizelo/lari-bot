import { Composer, InlineKeyboard, type Api } from 'grammy';
import { esc } from '../domain/formatting';
import type { Household } from '../db/schema';
import { getOrCreateHousehold, migrateChatId } from '../services/households';
import { deactivateMember, listActiveMembers } from '../services/members';
import { updatePinnedBalance } from '../services/render';

export async function renderMembersPanel(
  household: Household,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const active = await listActiveMembers(household.id);
  const list =
    active.length > 0
      ? active.map((m) => esc(m.displayName)).join(', ')
      : 'пока никого — нажмите кнопку';
  return {
    text: `👥 <b>Участники дележа:</b> ${list}\n\nРасходы делятся поровну между участниками. Нажми «Я участвую», чтобы войти в дележ.`,
    keyboard: new InlineKeyboard()
      .text('✅ Я участвую', 'j')
      .text('🚪 Я больше не участвую', 'lv'),
  };
}

export async function sendMembersPanel(api: Api, household: Household): Promise<void> {
  const { text, keyboard } = await renderMembersPanel(household);
  await api.sendMessage(household.tgChatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
}

const WELCOME = `Привет! Я Lari — считаю совместные расходы и делю их поровну.

Внести расход — просто сообщение: <code>67 кафе</code>, <code>113 продукты карфур</code>, <code>вчера 20 такси</code>. Я отвечу балансом — кто кому сколько должен.

Команды: /balance, /month, /last, /settle, /help.

Дай мне права админа, чтобы я закрепил сообщение с балансом.`;

export async function welcomeChat(api: Api, household: Household): Promise<void> {
  await api.sendMessage(household.tgChatId, WELCOME, { parse_mode: 'HTML' });
  await sendMembersPanel(api, household);
  await updatePinnedBalance(api, household);
}

export const membershipComposer = new Composer();

membershipComposer.on('my_chat_member', async (ctx) => {
  const { old_chat_member: oldM, new_chat_member: newM } = ctx.myChatMember;
  const wasOut = oldM.status === 'left' || oldM.status === 'kicked';
  const isIn = newM.status === 'member' || newM.status === 'administrator';
  if (!wasOut || !isIn) return;
  const household = await getOrCreateHousehold(ctx.chat.id, ctx.chat.title ?? 'Группа');
  await welcomeChat(ctx.api, household);
});

membershipComposer.on('message:new_chat_members', async (ctx) => {
  const humans = ctx.message.new_chat_members.filter((u) => !u.is_bot);
  if (humans.length === 0) return;
  const household = await getOrCreateHousehold(ctx.chat.id, ctx.chat.title ?? 'Группа');
  await sendMembersPanel(ctx.api, household);
});

membershipComposer.on('message:left_chat_member', async (ctx) => {
  const user = ctx.message.left_chat_member;
  if (user.is_bot) return;
  const household = await getOrCreateHousehold(ctx.chat.id, ctx.chat.title ?? 'Группа');
  await deactivateMember(household.id, user.id);
});

// Апгрейд группы в супергруппу меняет chat_id — переносим household на новый.
membershipComposer.on('message:migrate_to_chat_id', async (ctx) => {
  await migrateChatId(ctx.chat.id, ctx.message.migrate_to_chat_id);
});
