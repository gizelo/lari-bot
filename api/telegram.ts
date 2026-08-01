import type { VercelRequest, VercelResponse } from '@vercel/node';

// Заглушка фазы 1 — вебхук с проверкой секрета появится в фазе деплоя.
export default async function handler(_req: VercelRequest, res: VercelResponse): Promise<void> {
  res.status(200).json({ ok: true });
}
