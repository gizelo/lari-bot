import { Api } from 'grammy';
import { loadDotenv } from '../src/env.js';

loadDotenv();

const token = process.env.TELEGRAM_BOT_TOKEN;
if (!token) {
  console.error('TELEGRAM_BOT_TOKEN is required in the environment.');
  process.exit(1);
}

await new Api(token).deleteWebhook();
console.log('Webhook deleted; pnpm dev can now use long polling.');
