import { Bot } from 'grammy';
import { config } from './config';
import { callbacksComposer } from './handlers/callbacks';
import { commandsComposer } from './handlers/commands';
import { editComposer } from './handlers/edit';
import { expenseComposer } from './handlers/expense';
import { membershipComposer } from './handlers/membership';
import { adminComposer } from './handlers/admin';

let cached: Bot | undefined;

export function createBot(): Bot {
  if (cached) return cached;
  const bot = new Bot(config().TELEGRAM_BOT_TOKEN);

  bot.catch((err) => {
    console.error('Ошибка обработки апдейта', err.error);
  });

  // Личка: админка (категории, CSV-импорт) и справка.
  const priv = bot.chatType('private');
  priv.use(adminComposer);

  // Группы: каждая получает свой независимый household.
  const group = bot.chatType(['group', 'supergroup']);
  group.use(membershipComposer);
  group.use(commandsComposer);
  group.use(callbacksComposer);
  group.use(editComposer);
  group.use(expenseComposer);

  cached = bot;
  return bot;
}
