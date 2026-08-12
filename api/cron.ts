import type { VercelRequest, VercelResponse } from '@vercel/node';
import { Api } from 'grammy';
import { config, cronSecret } from '../src/config.js';
import { todayIn } from '../src/domain/dates.js';
import { monthSummaryView, prevYm } from '../src/handlers/commands.js';
import { listMonthExpenses } from '../src/services/expenses.js';
import { listHouseholds } from '../src/services/households.js';

// On the first day of each month, post the previous month's summary to every active group.
// The UTC schedule is configured in vercel.json.
export default async function handler(req: VercelRequest, res: VercelResponse): Promise<void> {
  let secret: string;
  try {
    secret = cronSecret();
  } catch (error) {
    console.error('cron_config_invalid', { error: String(error) });
    res.status(500).json({ ok: false });
    return;
  }
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
      // One unavailable group must not prevent delivery to the remaining groups.
      console.error(`Monthly summary failed for household ${hh.id}`, err);
    }
  }

  res.status(200).json({ ok: true, month: ym, sent });
}
