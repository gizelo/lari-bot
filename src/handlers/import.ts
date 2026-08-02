import { Composer, InlineKeyboard, type Api, type Context } from 'grammy';
import { config } from '../config';
import { parseExpensesCsv } from '../domain/csv';
import { todayIn } from '../domain/dates';
import { formatMoney } from '../domain/money';
import { getOrCreateHousehold } from '../services/households';
import { importCsvRows } from '../services/importer';
import { listActiveMembers } from '../services/members';
import { updatePinnedBalance } from '../services/render';

export const importComposer = new Composer();

async function downloadTelegramFile(api: Api, fileId: string): Promise<string> {
  const file = await api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config().TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать файл: ${res.status}`);
  return res.text();
}

async function parseCsvByFileId(api: Api, fileId: string) {
  const text = await downloadTelegramFile(api, fileId);
  const currentYear = Number(todayIn(config().TZ).slice(0, 4));
  return parseExpensesCsv(text, currentYear);
}

async function runImport(ctx: Context, fileId: string, manual: Map<string, string>): Promise<void> {
  const hh = await getOrCreateHousehold(ctx.chat!.id, ctx.chat!.title ?? 'Группа');
  const { rows } = await parseCsvByFileId(ctx.api, fileId);
  const result = await importCsvRows(hh.id, ctx.from?.id ?? 0, rows, manual);

  if (result.unknownPayers.length > 0) {
    const members = await listActiveMembers(hh.id);
    await ctx.reply(
      [
        `Не узнал плательщиков: ${result.unknownPayers.join(', ')}.`,
        `Участники дележа: ${members.map((m) => m.displayName).join(', ') || 'пока никого — пусть нажмут «Я участвую»'}.`,
        '',
        'Ответьте на это сообщение строками вида:',
        result.unknownPayers.map((n) => `${n} = ИмяУчастника`).join('\n'),
        `(код: map:${fileId})`,
      ].join('\n'),
      { reply_markup: { force_reply: true } },
    );
    return;
  }

  const lines = [
    'Импорт готов ✅',
    `Добавлено записей: ${result.inserted}`,
    ...(result.skippedDuplicates > 0 ? [`Пропущено дублей: ${result.skippedDuplicates}`] : []),
    ...(result.createdCategories.length > 0
      ? [`Созданы категории: ${result.createdCategories.join(', ')}`]
      : []),
  ];
  await ctx.reply(lines.join('\n'));
  await updatePinnedBalance(ctx.api, hh);
}

importComposer.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  const isCsv = doc.file_name?.toLowerCase().endsWith('.csv') || doc.mime_type === 'text/csv';
  if (!isCsv) return; // чужие файлы в группе нас не касаются

  const { rows, errors } = await parseCsvByFileId(ctx.api, doc.file_id);
  if (rows.length === 0) {
    await ctx.reply(
      `Не смог разобрать CSV:\n${errors.slice(0, 5).join('\n')}\n\nНужен заголовок: Дата, Сумма, Категория, Кто платил, Комментарий.`,
      { reply_parameters: { message_id: ctx.message.message_id } },
    );
    return;
  }

  const hh = await getOrCreateHousehold(ctx.chat.id, ctx.chat.title ?? 'Группа');
  const memberCount = (await listActiveMembers(hh.id)).length;
  const total = rows.reduce((acc, r) => acc + r.amountMinor, 0);
  const errNote =
    errors.length > 0
      ? `\n⚠️ Пропущу ${errors.length} строк:\n${errors.slice(0, 3).join('\n')}`
      : '';
  await ctx.reply(
    `Нашёл ${rows.length} записей на ${formatMoney(total, config().CURRENCY_SYMBOL)}.${errNote}\n\nКаждая запись поделится поровну между текущими участниками дележа (сейчас их ${memberCount}). Импортировать в эту группу?`,
    {
      reply_parameters: { message_id: ctx.message.message_id },
      reply_markup: new InlineKeyboard().text('✅ Импортировать', 'ci').text('✖️ Отмена', 'cx'),
    },
  );
});

// Файл достаём из сообщения, на которое отвечает сообщение с кнопкой.
importComposer.callbackQuery('ci', async (ctx) => {
  const doc = ctx.callbackQuery.message?.reply_to_message?.document;
  if (!doc) {
    await ctx.answerCallbackQuery({ text: 'Не нашёл исходный файл — пришлите CSV заново.' });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Импортирую…' });
  await ctx.editMessageReplyMarkup().catch(() => {});
  await runImport(ctx, doc.file_id, new Map());
});

importComposer.callbackQuery('cx', async (ctx) => {
  await ctx.answerCallbackQuery({ text: 'Отменено' });
  await ctx.editMessageText('Импорт отменён.').catch(() => {});
});

// Ответ с ручным сопоставлением плательщиков «Имя из CSV = Имя участника».
importComposer.on('message:text', async (ctx, next) => {
  const repliedText = ctx.message.reply_to_message?.text;
  const code = repliedText ? /\(код: map:([^)]+)\)/.exec(repliedText)?.[1] : undefined;
  if (!code) return next();

  const hh = await getOrCreateHousehold(ctx.chat.id, ctx.chat.title ?? 'Группа');
  const members = await listActiveMembers(hh.id);
  const norm = (s: string) => s.trim().toLowerCase().replaceAll('ё', 'е');
  const manual = new Map<string, string>();
  const bad: string[] = [];
  for (const line of ctx.message.text.split('\n')) {
    const m = /^(.+?)=(.+)$/.exec(line);
    if (!m) continue;
    const member = members.find((mm) => norm(mm.displayName) === norm(m[2]!));
    if (member) manual.set(norm(m[1]!), member.id);
    else bad.push(m[2]!.trim());
  }
  if (bad.length > 0) {
    await ctx.reply(
      `Не нашёл участников: ${bad.join(', ')}. Доступны: ${members.map((m) => m.displayName).join(', ')}.`,
    );
    return;
  }
  await runImport(ctx, code, manual);
});
