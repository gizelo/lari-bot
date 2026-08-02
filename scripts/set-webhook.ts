import { Api } from 'grammy';
import { loadDotenv } from '../src/env.js';

loadDotenv();

const url = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
const secret = process.env.TELEGRAM_WEBHOOK_SECRET;

if (!url || !token || !secret) {
  console.error(
    'Использование: pnpm setwebhook https://<проект>.vercel.app/api/telegram\n' +
      'Нужны env: TELEGRAM_BOT_TOKEN, TELEGRAM_WEBHOOK_SECRET (32+ символа).',
  );
  process.exit(1);
}

const api = new Api(token);
await api.setWebhook(url, {
  secret_token: secret,
  allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
});
const info = await api.getWebhookInfo();
console.log(`Вебхук установлен: ${info.url}`);
