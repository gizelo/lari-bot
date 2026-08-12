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
    console.error('Update handling failed', err.error);
  });

  // Private chats provide help only; all data and settings belong to groups.
  bot.chatType('private').use(privateComposer);

  // Each group gets an independent household with its own expenses, categories, and history.
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
