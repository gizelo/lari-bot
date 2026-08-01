import { Composer, InlineKeyboard, type Api, type Context } from 'grammy';
import { config } from '../config';
import { todayIn } from '../domain/dates';
import { parseExpensesCsv } from '../domain/csv';
import { esc } from '../domain/formatting';
import { formatMoney } from '../domain/money';
import {
  createCategory,
  getCategory,
  listAllCategories,
  renameCategory,
  setCategoryAliases,
  setCategoryArchived,
  setCategoryEmoji,
} from '../services/categories';
import { getHouseholdById, listHouseholds } from '../services/households';
import { importCsvRows } from '../services/importer';
import { listActiveMembers } from '../services/members';
import { updatePinnedBalance } from '../services/render';

export const adminComposer = new Composer();

adminComposer.command('start', async (ctx) => {
  const isAdmin = ctx.from?.id === config().ADMIN_TG_ID;
  const idLine = `Твой Telegram ID: <code>${ctx.from?.id}</code>`;
  if (isAdmin) {
    await ctx.reply(
      `${idLine}\n\nТы админ. Здесь можно:\n/categories — категории (общие для всех групп)\nПрислать CSV-файл — импорт истории в группу.\n\nФормат CSV: Дата, Сумма, Категория, Кто платил, Комментарий.`,
      { parse_mode: 'HTML' },
    );
    return;
  }
  await ctx.reply(
    `${idLine}\n\nЯ считаю совместные расходы в группах и делю их поровну. Добавь меня в группу — и я всё объясню.`,
    { parse_mode: 'HTML' },
  );
});

const admin = adminComposer.filter((ctx) => ctx.from?.id === config().ADMIN_TG_ID);

// ── Категории ────────────────────────────────────────────────────────────────

async function categoriesPanel(): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const cats = await listAllCategories();
  const active = cats.filter((c) => !c.isArchived);
  const archived = cats.filter((c) => c.isArchived);
  const line = (c: (typeof cats)[number]) => `${c.emoji ? `${c.emoji} ` : ''}${esc(c.name)}`;
  const text = [
    '🏷 <b>Категории</b> (общие для всех групп)',
    '',
    active.map(line).join(' · ') || 'нет активных',
    ...(archived.length > 0 ? ['', `📦 В архиве: ${archived.map(line).join(' · ')}`] : []),
    '',
    'Переименование меняет отображение во всей истории. Для другой статьи расходов заводи новую категорию, а старую отправляй в архив.',
  ].join('\n');
  return {
    text,
    keyboard: new InlineKeyboard()
      .text('➕ Добавить', 'ca:add')
      .text('✏️ Изменить', 'ca:edit'),
  };
}

async function showCategoriesPanel(ctx: Context, edit: boolean): Promise<void> {
  const { text, keyboard } = await categoriesPanel();
  if (edit) {
    await ctx
      .editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard })
      .catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

admin.command('categories', (ctx) => showCategoriesPanel(ctx, false));
admin.hears(/^категории$/iu, (ctx) => showCategoriesPanel(ctx, false));

// Контекст force_reply кодируется прямо в тексте подсказки — состояние не нужно.
async function askForceReply(ctx: Context, prompt: string, code: string): Promise<void> {
  await ctx.reply(`${prompt}\n(код: ${code})`, {
    reply_markup: { force_reply: true },
  });
}

admin.callbackQuery('ca:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  await askForceReply(ctx, 'Название новой категории:', 'add');
});

admin.callbackQuery('ca:edit', async (ctx) => {
  await ctx.answerCallbackQuery();
  const cats = await listAllCategories();
  const kb = new InlineKeyboard();
  for (const c of cats) {
    kb.text(`${c.isArchived ? '📦 ' : ''}${c.emoji ? `${c.emoji} ` : ''}${c.name}`, `ca:e:${c.id}`).row();
  }
  kb.text('⬅️ Назад', 'ca:list');
  await ctx
    .editMessageText('Какую категорию изменить?', { reply_markup: kb })
    .catch(() => {});
});

admin.callbackQuery('ca:list', async (ctx) => {
  await ctx.answerCallbackQuery();
  await showCategoriesPanel(ctx, true);
});

async function categoryDetail(ctx: Context, id: string): Promise<void> {
  const cat = await getCategory(id);
  if (!cat) return;
  const text = [
    `${cat.emoji ? `${cat.emoji} ` : ''}<b>${esc(cat.name)}</b>${cat.isArchived ? ' (в архиве)' : ''}`,
    `Алиасы: ${cat.aliases.map(esc).join(', ') || 'нет'}`,
  ].join('\n');
  const kb = new InlineKeyboard()
    .text('✏️ Переименовать', `ca:rn:${id}`)
    .row()
    .text('🏷 Алиасы', `ca:al:${id}`)
    .text('😀 Emoji', `ca:em:${id}`)
    .row()
    .text(cat.isArchived ? '↩️ Вернуть из архива' : '📦 В архив', `ca:ar:${id}`)
    .row()
    .text('⬅️ Назад', 'ca:edit');
  await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: kb }).catch(() => {});
}

admin.callbackQuery(/^ca:e:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await categoryDetail(ctx, ctx.match[1]!);
});

admin.callbackQuery(/^ca:rn:(.+)$/, async (ctx) => {
  const cat = await getCategory(ctx.match[1]!);
  await ctx.answerCallbackQuery();
  if (!cat) return;
  await askForceReply(ctx, `Новое название для «${cat.name}»:`, `rn:${cat.id}`);
});

admin.callbackQuery(/^ca:al:(.+)$/, async (ctx) => {
  const cat = await getCategory(ctx.match[1]!);
  await ctx.answerCallbackQuery();
  if (!cat) return;
  await askForceReply(
    ctx,
    `Алиасы для «${cat.name}» через запятую (полный список, заменит текущий).\nСейчас: ${cat.aliases.join(', ') || 'нет'}`,
    `al:${cat.id}`,
  );
});

admin.callbackQuery(/^ca:em:(.+)$/, async (ctx) => {
  const cat = await getCategory(ctx.match[1]!);
  await ctx.answerCallbackQuery();
  if (!cat) return;
  await askForceReply(ctx, `Emoji для «${cat.name}» (или «-», чтобы убрать):`, `em:${cat.id}`);
});

admin.callbackQuery(/^ca:ar:(.+)$/, async (ctx) => {
  const cat = await getCategory(ctx.match[1]!);
  if (!cat) {
    await ctx.answerCallbackQuery();
    return;
  }
  await setCategoryArchived(cat.id, !cat.isArchived);
  await ctx.answerCallbackQuery({
    text: cat.isArchived ? 'Категория возвращена' : 'Категория в архиве',
  });
  await categoryDetail(ctx, cat.id);
});

// ── CSV-импорт ───────────────────────────────────────────────────────────────

async function downloadTelegramFile(api: Api, fileId: string): Promise<string> {
  const file = await api.getFile(fileId);
  const url = `https://api.telegram.org/file/bot${config().TELEGRAM_BOT_TOKEN}/${file.file_path}`;
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Не удалось скачать файл: ${res.status}`);
  return res.text();
}

admin.on('message:document', async (ctx) => {
  const doc = ctx.message.document;
  const isCsv = doc.file_name?.toLowerCase().endsWith('.csv') || doc.mime_type === 'text/csv';
  if (!isCsv) {
    await ctx.reply('Я принимаю только .csv-файлы (Дата, Сумма, Категория, Кто платил, Комментарий).');
    return;
  }

  const text = await downloadTelegramFile(ctx.api, doc.file_id);
  const currentYear = Number(todayIn(config().TZ).slice(0, 4));
  const { rows, errors } = parseExpensesCsv(text, currentYear);
  if (rows.length === 0) {
    await ctx.reply(`Не смог разобрать файл:\n${errors.slice(0, 5).join('\n')}`);
    return;
  }

  const households = await listHouseholds();
  if (households.length === 0) {
    await ctx.reply('Пока нет ни одной группы — сначала добавь меня в группу.');
    return;
  }

  const total = rows.reduce((acc, r) => acc + r.amountMinor, 0);
  const kb = new InlineKeyboard();
  for (const hh of households) kb.text(hh.title, `ci:${hh.id}`).row();
  const errNote =
    errors.length > 0 ? `\n⚠️ Пропущу ${errors.length} строк:\n${errors.slice(0, 3).join('\n')}` : '';
  await ctx.reply(
    `Нашёл ${rows.length} записей на ${formatMoney(total, config().CURRENCY_SYMBOL)}.${errNote}\n\nВ какую группу импортировать?`,
    { reply_parameters: { message_id: ctx.message.message_id }, reply_markup: kb },
  );
});

async function reportImport(
  ctx: Context,
  householdId: string,
  result: { inserted: number; skippedDuplicates: number; createdCategories: string[] },
): Promise<void> {
  const lines = [
    `Импорт готов ✅`,
    `Добавлено записей: ${result.inserted}`,
    ...(result.skippedDuplicates > 0 ? [`Пропущено дублей: ${result.skippedDuplicates}`] : []),
    ...(result.createdCategories.length > 0
      ? [`Созданы категории: ${result.createdCategories.join(', ')}`]
      : []),
  ];
  await ctx.reply(lines.join('\n'));
  const hh = await getHouseholdById(householdId);
  if (hh) await updatePinnedBalance(ctx.api, hh);
}

async function askPayerMapping(
  ctx: Context,
  householdId: string,
  fileId: string,
  unknown: string[],
): Promise<void> {
  const members = await listActiveMembers(householdId);
  await ctx.reply(
    [
      `Не узнал плательщиков: ${unknown.join(', ')}.`,
      `Участники группы: ${members.map((m) => m.displayName).join(', ') || 'пока никого (пусть нажмут «Я участвую»)'}.`,
      '',
      'Ответь на это сообщение строками вида:',
      unknown.map((n) => `${n} = ИмяУчастника`).join('\n'),
      `(код: map:${householdId}:${fileId})`,
    ].join('\n'),
    { reply_markup: { force_reply: true } },
  );
}

admin.callbackQuery(/^ci:(.+)$/, async (ctx) => {
  const householdId = ctx.match[1]!;
  const doc = ctx.callbackQuery.message?.reply_to_message?.document;
  if (!doc) {
    await ctx.answerCallbackQuery({ text: 'Не нашёл исходный файл — пришли CSV заново.' });
    return;
  }
  await ctx.answerCallbackQuery({ text: 'Импортирую…' });
  await ctx.editMessageReplyMarkup().catch(() => {});

  const text = await downloadTelegramFile(ctx.api, doc.file_id);
  const currentYear = Number(todayIn(config().TZ).slice(0, 4));
  const { rows } = parseExpensesCsv(text, currentYear);
  const result = await importCsvRows(householdId, ctx.from.id, rows, new Map());
  if (result.unknownPayers.length > 0) {
    await askPayerMapping(ctx, householdId, doc.file_id, result.unknownPayers);
    return;
  }
  await reportImport(ctx, householdId, result);
});

// ── Диспетчер force_reply-ответов ────────────────────────────────────────────

admin.on('message:text', async (ctx) => {
  const repliedText = ctx.message.reply_to_message?.text;
  const code = repliedText ? /\(код: ([^)]+)\)/.exec(repliedText)?.[1] : undefined;
  if (!code) {
    await ctx.reply('Это личка для настройки. /categories — категории, CSV-файл — импорт истории.');
    return;
  }
  const input = ctx.message.text.trim();

  if (code === 'add') {
    const created = await createCategory(input);
    await ctx.reply(created ? `Категория «${created.name}» добавлена ✅` : 'Такая категория уже есть.');
    return;
  }

  const [action, ...params] = code.split(':');

  if (action === 'rn' || action === 'al' || action === 'em') {
    const id = params[0]!;
    const cat = await getCategory(id);
    if (!cat) {
      await ctx.reply('Категория не найдена.');
      return;
    }
    if (action === 'rn') {
      await renameCategory(id, input);
      await ctx.reply(`«${cat.name}» → «${input}» ✅ Отображение обновилось во всей истории.`);
    } else if (action === 'al') {
      const aliases = input
        .split(',')
        .map((a) => a.trim().toLowerCase())
        .filter(Boolean);
      await setCategoryAliases(id, aliases);
      await ctx.reply(`Алиасы «${cat.name}»: ${aliases.join(', ') || 'нет'} ✅`);
    } else {
      await setCategoryEmoji(id, input === '-' ? null : input.slice(0, 8));
      await ctx.reply('Emoji обновлён ✅');
    }
    return;
  }

  if (action === 'map') {
    const householdId = params[0]!;
    const fileId = params.slice(1).join(':');
    const members = await listActiveMembers(householdId);
    const manual = new Map<string, string>();
    const bad: string[] = [];
    for (const line of input.split('\n')) {
      const m = /^(.+?)=(.+)$/.exec(line);
      if (!m) continue;
      const csvName = m[1]!.trim().toLowerCase().replaceAll('ё', 'е');
      const memberName = m[2]!.trim().toLowerCase().replaceAll('ё', 'е');
      const member = members.find(
        (mm) => mm.displayName.toLowerCase().replaceAll('ё', 'е') === memberName,
      );
      if (member) manual.set(csvName, member.id);
      else bad.push(m[2]!.trim());
    }
    if (bad.length > 0) {
      await ctx.reply(
        `Не нашёл участников: ${bad.join(', ')}. Доступны: ${members.map((m) => m.displayName).join(', ')}.`,
      );
      return;
    }
    const text = await downloadTelegramFile(ctx.api, fileId);
    const currentYear = Number(todayIn(config().TZ).slice(0, 4));
    const { rows } = parseExpensesCsv(text, currentYear);
    const result = await importCsvRows(householdId, ctx.from!.id, rows, manual);
    if (result.unknownPayers.length > 0) {
      await askPayerMapping(ctx, householdId, fileId, result.unknownPayers);
      return;
    }
    await reportImport(ctx, householdId, result);
  }
});

// Не-админ в личке.
adminComposer.on('message', async (ctx) => {
  await ctx.reply('Я работаю в группах: добавь меня в группу, и я объясню, как вести учёт.');
});
