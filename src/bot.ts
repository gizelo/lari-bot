import { Bot } from 'grammy';
import { config } from './config.js';
import { callbacksComposer } from './handlers/callbacks.js';
import { categoriesComposer } from './handlers/categories.js';
import { commandsComposer } from './handlers/commands.js';
import { editComposer } from './handlers/edit.js';
import { expenseComposer } from './handlers/expense.js';
import { membershipComposer } from './handlers/membership.js';
import { privateComposer } from './handlers/private.js';

let cached: Bot | undefined;

export function createBot(): Bot {
  if (cached) return cached;
  const bot = new Bot(config().TELEGRAM_BOT_TOKEN);

  bot.catch((err) => {
    console.error('Ошибка обработки апдейта', err.error);
  });

  // Личка — только справка: все данные и настройки живут в группах.
  bot.chatType('private').use(privateComposer);

  // Группы: каждая получает свой независимый household (траты, категории, история).
  const group = bot.chatType(['group', 'supergroup']);
  group.use(membershipComposer);
  group.use(commandsComposer);
  group.use(categoriesComposer);
  group.use(callbacksComposer);
  group.use(editComposer);
  group.use(expenseComposer);

  cached = bot;
  return bot;
}
