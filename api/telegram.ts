import type { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookCallback } from 'grammy';
import { createBot } from '../src/bot.js';
import { webhookSecret } from '../src/config.js';

let webhookHandler: ((req: VercelRequest, res: VercelResponse) => Promise<unknown>) | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  if (req.method !== 'POST') {
    res.status(405).json({ ok: false });
    return;
  }
  let secret: string;
  try {
    secret = webhookSecret();
  } catch (error) {
    console.error('webhook_config_invalid', { error: String(error) });
    res.status(500).json({ ok: false });
    return;
  }
  const provided = req.headers['x-telegram-bot-api-secret-token'];
  if (!secret || provided !== secret) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    if (!webhookHandler) {
      const bot = createBot();
      if (!bot.isInited()) await bot.init();
      webhookHandler = webhookCallback(bot, 'http', {
        onTimeout: 'throw',
        timeoutMilliseconds: 25_000,
      });
    }
    await webhookHandler(req, res);
  } catch (error) {
    console.error('webhook_processing_failed', {
      updateId: typeof req.body?.update_id === 'number' ? req.body.update_id : undefined,
      error: String(error),
    });
    if (!res.headersSent) res.status(500).json({ ok: false });
  }
}
