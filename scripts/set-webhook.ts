import { Api } from 'grammy';
import { loadDotenv } from '../src/env.js';
import { webhookSecret } from '../src/config.js';

loadDotenv();

const url = process.argv[2];
const token = process.env.TELEGRAM_BOT_TOKEN;
let secret: string | undefined;
try {
  secret = webhookSecret();
} catch {
  secret = undefined;
}

if (!url || !token || !secret) {
  console.error(
    'Usage: pnpm setwebhook https://<project>.vercel.app/api/telegram\n' +
      'Required environment variables: TELEGRAM_BOT_TOKEN and TELEGRAM_WEBHOOK_SECRET (32+ characters).',
  );
  process.exit(1);
}

const api = new Api(token);
await api.setWebhook(url, {
  secret_token: secret,
  allowed_updates: ['message', 'edited_message', 'callback_query', 'my_chat_member'],
});
const info = await api.getWebhookInfo();
console.log(`Webhook configured: ${info.url}`);
