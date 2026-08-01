import { Composer, InlineKeyboard, InputFile, type Context } from 'grammy';
import { config } from '../config';
import type { Household, Member } from '../db/schema';
import { todayIn } from '../domain/dates';
import { esc, renderTransfers } from '../domain/formatting';
import { formatMoney } from '../domain/money';
import { parseAmountToMinor } from '../domain/money';
import {
  createExpense,
  listAllExpenses,
  listMonthExpenses,
  listRecentExpenses,
  setReplyMessageId,
  type ExpenseRow,
} from '../services/expenses';
import { getOrCreateHousehold } from '../services/households';
import { ensureMember, listActiveMembers, listAllMembers } from '../services/members';
import { balanceView, updatePinnedBalance } from '../services/render';
import { displayName } from './expense';
import { sendMembersPanel, welcomeChat } from './membership';

const MONTHS = [
  'Январь', 'Февраль', 'Март', 'Апрель', 'Май', 'Июнь',
  'Июль', 'Август', 'Сентябрь', 'Октябрь', 'Ноябрь', 'Декабрь',
];

async function household(ctx: Context): Promise<Household> {
  return getOrCreateHousehold(ctx.chat!.id, ctx.chat!.title ?? 'Группа');
}

async function sendBalance(ctx: Context): Promise<void> {
  const hh = await household(ctx);
  const { transfers, names } = await balanceView(hh.id);
  await ctx.reply(`⚖️ ${renderTransfers(transfers, names, config().CURRENCY_SYMBOL)}`, {
    parse_mode: 'HTML',
  });
}

function parseMonthArg(arg: string | undefined, tz: string): string | null {
  const today = todayIn(tz);
  if (!arg) return today.slice(0, 7);
  if (/^\d{4}-\d{2}$/.test(arg)) return arg;
  if (/^\d{1,2}$/.test(arg)) {
    const m = Number(arg);
    if (m < 1 || m > 12) return null;
    return `${today.slice(0, 4)}-${String(m).padStart(2, '0')}`;
  }
  return null;
}

function renderMonthSummary(
  ym: string,
  rows: ExpenseRow[],
  balanceText: string,
  symbol: string,
): string {
  const [year, month] = ym.split('-');
  const title = `📊 <b>${MONTHS[Number(month) - 1]} ${year}</b>`;

  const spends = rows.filter((r) => r.kind === 'expense');
  if (spends.length === 0) {
    return `${title}\n\nЗа этот месяц записей нет.\n\n⚖️ Текущий баланс (за всё время):\n${balanceText}`;
  }

  type Bucket = { label: string; total: number; byPayer: Map<string, number> };
  const buckets = new Map<string, Bucket>();
  let total = 0;
  const payerTotals = new Map<string, number>();

  for (const r of spends) {
    const key = r.categoryId ?? 'none';
    const label = r.categoryName
      ? `${r.categoryEmoji ? `${r.categoryEmoji} ` : ''}${esc(r.categoryName)}`
      : '❓ Без категории';
    const bucket = buckets.get(key) ?? { label, total: 0, byPayer: new Map() };
    bucket.total += r.amountMinor;
    bucket.byPayer.set(r.payerName, (bucket.byPayer.get(r.payerName) ?? 0) + r.amountMinor);
    buckets.set(key, bucket);
    total += r.amountMinor;
    payerTotals.set(r.payerName, (payerTotals.get(r.payerName) ?? 0) + r.amountMinor);
  }

  const lines = [...buckets.values()]
    .sort((a, b) => b.total - a.total)
    .map((b) => {
      const byPayer = [...b.byPayer.entries()]
        .map(([name, sum]) => `${esc(name)} ${formatMoney(sum, symbol)}`)
        .join(' · ');
      return `${b.label} — <b>${formatMoney(b.total, symbol)}</b>\n      ${byPayer}`;
    });

  const paid = [...payerTotals.entries()]
    .map(([name, sum]) => `${esc(name)} ${formatMoney(sum, symbol)}`)
    .join(' · ');

  return [
    title,
    '',
    ...lines,
    '─'.repeat(20),
    `ИТОГО <b>${formatMoney(total, symbol)}</b>`,
    `Заплатили: ${paid}`,
    '',
    '⚖️ Текущий баланс (за всё время):',
    balanceText,
  ].join('\n');
}

/** Создаёт «расчёт на паузе» и просит подтвердить кнопкой — тот же механизм, что крупные суммы. */
async function proposeSettlement(
  ctx: Context,
  hh: Household,
  from: Member,
  to: Member,
  amountMinor: number,
): Promise<void> {
  const symbol = config().CURRENCY_SYMBOL;
  const created = await createExpense({
    householdId: hh.id,
    kind: 'settlement',
    categoryId: null,
    payerId: from.id,
    amountMinor,
    comment: to.displayName,
    spentOn: todayIn(config().TZ),
    createdByTgId: ctx.from?.id ?? 0,
    pending: true,
    shares: [{ memberId: to.id, shareMinor: amountMinor }],
  });
  if (!created) return;
  const msg = await ctx.reply(
    `Рассчитаться на ${formatMoney(amountMinor, symbol)}?\n${esc(from.displayName)} переводит ${esc(to.displayName)} ${formatMoney(amountMinor, symbol)}.`,
    {
      reply_markup: new InlineKeyboard()
        .text('✅ Подтвердить', `ok:${created.id}`)
        .text('✖️ Отмена', `x:${created.id}`),
    },
  );
  await setReplyMessageId(created.id, msg.message_id);
}

export const commandsComposer = new Composer();
const cmd = commandsComposer;

cmd.command('start', async (ctx) => {
  const hh = await household(ctx);
  await welcomeChat(ctx.api, hh);
});

cmd.command('balance', sendBalance);
cmd.hears(/^баланс$/iu, sendBalance);

async function sendMonth(ctx: Context, arg?: string): Promise<void> {
  const cfg = config();
  const ym = parseMonthArg(arg, cfg.TZ);
  if (!ym) {
    await ctx.reply('Не понял месяц. Форматы: /month, /month 07, /month 2026-07');
    return;
  }
  const hh = await household(ctx);
  const [rows, { transfers, names }] = await Promise.all([
    listMonthExpenses(hh.id, ym),
    balanceView(hh.id),
  ]);
  const balanceText = renderTransfers(transfers, names, cfg.CURRENCY_SYMBOL);
  await ctx.reply(renderMonthSummary(ym, rows, balanceText, cfg.CURRENCY_SYMBOL), {
    parse_mode: 'HTML',
  });
}

cmd.command('month', async (ctx) => sendMonth(ctx, ctx.match.trim() || undefined));
cmd.hears(/^(итого|месяц)$/iu, async (ctx) => sendMonth(ctx));

async function sendLast(ctx: Context): Promise<void> {
  const hh = await household(ctx);
  const rows = await listRecentExpenses(hh.id, 10);
  if (rows.length === 0) {
    await ctx.reply('Записей пока нет.');
    return;
  }
  const symbol = config().CURRENCY_SYMBOL;
  const kb = new InlineKeyboard();
  const lines = rows.map((r, i) => {
    const date = `${r.spentOn.slice(8, 10)}.${r.spentOn.slice(5, 7)}`;
    const cat =
      r.kind === 'settlement' ? '💸 расчёт' : (r.categoryName ?? 'без категории');
    const comment = r.comment ? ` · ${esc(r.comment)}` : '';
    kb.text(`🗑 ${i + 1}. ${date} · ${formatMoney(r.amountMinor, symbol)}`, `d:${r.id}`).row();
    return `${i + 1}. ${date} · <b>${formatMoney(r.amountMinor, symbol)}</b> · ${cat} · ${esc(r.payerName)}${comment}`;
  });
  await ctx.reply(`🧾 Последние записи:\n${lines.join('\n')}`, {
    parse_mode: 'HTML',
    reply_markup: kb,
  });
}

cmd.command('last', sendLast);
cmd.hears(/^последние$/iu, sendLast);

async function settle(ctx: Context, arg?: string): Promise<void> {
  const hh = await household(ctx);
  const { transfers } = await balanceView(hh.id);
  if (transfers.length === 0) {
    await ctx.reply('Вы в расчёте 🎉');
    return;
  }
  const all = await listAllMembers(hh.id);
  const byId = new Map(all.map((m) => [m.id, m]));

  if (arg) {
    const amountMinor = parseAmountToMinor(arg);
    if (!amountMinor) {
      await ctx.reply('Не понял сумму. Пример: /settle 20');
      return;
    }
    // Частичный расчёт делает должник: ищем перевод от вызвавшего команду.
    const caller = all.find((m) => m.tgUserId === ctx.from?.id);
    const mine = transfers.filter((t) => t.fromId === caller?.id);
    if (!caller || mine.length === 0) {
      await ctx.reply('Ты сейчас никому не должен — частичный расчёт не нужен.');
      return;
    }
    const target = mine[0]!;
    await proposeSettlement(ctx, hh, caller, byId.get(target.toId)!, amountMinor);
    return;
  }

  for (const t of transfers) {
    await proposeSettlement(ctx, hh, byId.get(t.fromId)!, byId.get(t.toId)!, t.amountMinor);
  }
}

cmd.command('settle', async (ctx) => settle(ctx, ctx.match.trim() || undefined));
cmd.hears(/^рассчитались$/iu, async (ctx) => settle(ctx));

cmd.command('members', async (ctx) => {
  const hh = await household(ctx);
  await sendMembersPanel(ctx.api, hh);
});
cmd.hears(/^участники$/iu, async (ctx) => {
  const hh = await household(ctx);
  await sendMembersPanel(ctx.api, hh);
});

cmd.command('export', async (ctx) => {
  const hh = await household(ctx);
  const rows = await listAllExpenses(hh.id);
  if (rows.length === 0) {
    await ctx.reply('Экспортировать нечего — записей нет.');
    return;
  }
  const csvEsc = (s: string) => (/[",\n]/.test(s) ? `"${s.replaceAll('"', '""')}"` : s);
  const lines = [
    'Дата,Тип,Сумма,Категория,Кто платил,Комментарий',
    ...rows.map((r) =>
      [
        r.spentOn,
        r.kind === 'settlement' ? 'расчёт' : 'расход',
        (r.amountMinor / 100).toFixed(2),
        csvEsc(r.categoryName ?? ''),
        csvEsc(r.payerName),
        csvEsc(r.comment ?? ''),
      ].join(','),
    ),
  ];
  await ctx.replyWithDocument(
    new InputFile(Buffer.from(lines.join('\n'), 'utf-8'), `lari-export-${todayIn(config().TZ)}.csv`),
  );
});

const HELP = `Я считаю совместные расходы и делю их поровну между участниками.

<b>Внести расход</b> — просто сообщение:
<code>56 кафе</code> — 56 ₾, категория Кафе
<code>кафе 56</code> — то же самое
<code>113 продукты карфур</code> — с комментарием
<code>вчера 20 такси</code>, <code>24.07 68 продукты</code> — с датой
<code>56</code> — без категории, я спрошу кнопками

<b>Команды</b>
/balance — кто кому должен
/month — сводка за месяц (или /month 07)
/last — последние 10 записей
/settle — рассчитаться полностью, /settle 20 — частично
/members — участники дележа
/export — вся история в CSV

«Никита → Роберт: 20 ₾» значит: Никита должен перевести Роберту 20 ₾.`;

cmd.command('help', async (ctx) => {
  await ctx.reply(HELP, { parse_mode: 'HTML' });
});
cmd.hears(/^помощь$/iu, async (ctx) => {
  await ctx.reply(HELP, { parse_mode: 'HTML' });
});

// Расход, внесённый автором впервые, регистрирует его участником — /join не обязателен,
// но команда полезна тем, кто хочет войти в дележ до первой траты.
cmd.command('join', async (ctx) => {
  if (!ctx.from) return;
  const hh = await household(ctx);
  await ensureMember(hh.id, ctx.from.id, displayName(ctx.from));
  const active = await listActiveMembers(hh.id);
  await ctx.reply(
    `Ты в дележе ✅ Участников: ${active.length}. Полный список: /members`,
  );
  await updatePinnedBalance(ctx.api, hh);
});
