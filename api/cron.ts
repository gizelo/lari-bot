import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Api } from 'grammy';
import { config } from '../src/config.js';
import { todayIn } from '../src/domain/dates.js';
import { monthSummaryView, prevYm } from '../src/handlers/commands.js';
import { listMonthExpenses } from '../src/services/expenses.js';
import { listHouseholds } from '../src/services/households.js';

// Ежемесячная автосводка: 1-го числа бот постит в каждую активную группу
// итог прошлого месяца (расписание — в vercel.json, время в UTC).
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  const secret = process.env.CRON_SECRET;
  if (!secret || req.headers.authorization !== `Bearer ${secret}`) {
    res.status(401).json({ ok: false });
    return;
  }

  const cfg = config();
  const api = new Api(cfg.TELEGRAM_BOT_TOKEN);
  const ym = prevYm(todayIn(cfg.TZ).slice(0, 7));

  let sent = 0;
  for (const hh of await listHouseholds()) {
    try {
      const rows = await listMonthExpenses(hh.id, ym);
      if (!rows.some((r) => r.kind === 'expense')) continue;
      const { text, keyboard } = await monthSummaryView(hh, ym);
      await api.sendMessage(hh.tgChatId, text, { parse_mode: 'HTML', reply_markup: keyboard });
      sent++;
    } catch (err) {
      // Одна недоступная группа (бота удалили и т.п.) не должна ронять рассылку.
      console.error(`Автосводка не отправлена в household ${hh.id}`, err);
    }
  }

  res.status(200).json({ ok: true, month: ym, sent });
}
