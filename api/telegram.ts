import type { VercelRequest, VercelResponse } from '@vercel/node';

// Тяжёлые импорты — лениво внутри хендлера, чтобы не тормозить холодный старт.
let webhookHandler: ((req: VercelRequest, res: VercelResponse) => Promise<unknown>) | undefined;

export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.TELEGRAM_WEBHOOK_SECRET;
  const provided = req.headers['x-telegram-bot-api-secret-token'];
  if (!secret || provided !== secret) {
    res.status(401).json({ ok: false });
    return;
  }

  try {
    if (!webhookHandler) {
      const [{ webhookCallback }, { createBot }] = await Promise.all([
        import('grammy'),
        import('../src/bot'),
      ]);
      const bot = createBot();
      if (!bot.isInited()) await bot.init();
      webhookHandler = webhookCallback(bot, 'http');
    }
    await webhookHandler(req, res);
  } catch (err) {
    // Ошибки логируем, но Telegram отвечаем 200 — иначе он уходит в цикл ретраев.
    console.error('Ошибка вебхука', err);
    if (!res.headersSent) res.status(200).json({ ok: true });
  }
}
