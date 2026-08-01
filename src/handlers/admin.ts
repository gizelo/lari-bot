import { Composer } from 'grammy';
import { config } from '../config';

export const adminComposer = new Composer();

adminComposer.command('start', async (ctx) => {
  const isAdmin = ctx.from?.id === config().ADMIN_TG_ID;
  const idLine = `Твой Telegram ID: <code>${ctx.from?.id}</code>`;
  if (isAdmin) {
    await ctx.reply(
      `${idLine}\n\nТы админ. Здесь можно:\n/categories — управлять категориями (общие для всех групп)\nОтправь CSV-файл, чтобы импортировать историю в группу.`,
      { parse_mode: 'HTML' },
    );
    return;
  }
  await ctx.reply(
    `${idLine}\n\nЯ считаю совместные расходы в группах. Добавь меня в группу — и я всё объясню.`,
    { parse_mode: 'HTML' },
  );
});
