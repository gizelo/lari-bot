import { Composer } from 'grammy';

// В личке нет ни данных, ни настроек: все траты, категории и импорт живут в группах,
// у каждой группы — своё независимое хозяйство.
export const privateComposer = new Composer();

const PRIVATE_HELP = `Я считаю совместные расходы в группах и делю их поровну между участниками.

Добавь меня в группу — я поздороваюсь и всё объясню. Каждая группа получает свой независимый учёт: свои категории (/categories в группе), свою историю и свой баланс.

Импорт старой истории: отправь CSV-файл (Дата, Сумма, Категория, Кто платил, Комментарий) прямо в группу.`;

privateComposer.command('start', async (ctx) => {
  await ctx.reply(`Твой Telegram ID: <code>${ctx.from?.id}</code>\n\n${PRIVATE_HELP}`, {
    parse_mode: 'HTML',
  });
});

privateComposer.on('message', async (ctx) => {
  await ctx.reply(PRIVATE_HELP);
});
