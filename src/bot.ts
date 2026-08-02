import { Bot } from 'grammy';
import { config } from './config';
import { callbacksComposer } from './handlers/callbacks';
import { categoriesComposer } from './handlers/categories';
import { commandsComposer } from './handlers/commands';
import { editComposer } from './handlers/edit';
import { expenseComposer } from './handlers/expense';
import { membershipComposer } from './handlers/membership';
import { privateComposer } from './handlers/private';

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
