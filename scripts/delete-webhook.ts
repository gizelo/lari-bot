import { Api } from 'grammy';
import { loadDotenv } from '../src/env.js';

loadDotenv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('Нужен TELEGRAM_BOT_TOKEN в env.');
  process.exit(1);
}

await new Api(token).deleteWebhook();
console.log('Вебхук удалён — можно запускать pnpm dev (long polling).');
