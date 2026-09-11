import type { VercelRequest, VercelResponse } from '@vercel/node';
import { webhookCallback } from 'grammy';
import { createBot } from '../src/bot.js';
import { webhookSecret } from '../src/config.js';

let webhookHandler: ((req: VercelRequest, res: VercelResponse) => Promise<unknown>) | undefined;

function errorChain(value: unknown): string[] {
  const messages: string[] = [];
  const seen = new Set<unknown>();
  let current = value;
  while (current && !seen.has(current) && messages.length < 5) {
    seen.add(current);
    messages.push(String(current));
    if (typeof current !== 'object') break;
    current = 'error' in current ? current.error : 'cause' in current ? current.cause : undefined;
  }
  return messages;
}

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
      errors: errorChain(error),
    });
    if (!res.headersSent) res.status(500).json({ ok: false });
  }
}
