import { Composer, InlineKeyboard, type Context } from 'grammy';
import { esc } from '../domain/formatting.js';
import {
  createCategory,
  getCategory,
  listAllCategories,
  renameCategory,
  setCategoryAliases,
  setCategoryArchived,
  setCategoryEmoji,
} from '../services/categories.js';
import { getOrCreateHousehold } from '../services/households.js';

export const categoriesComposer = new Composer();

async function household(ctx: Context) {
  return getOrCreateHousehold(ctx.chat!.id, ctx.chat!.title ?? 'Группа');
}

async function categoriesPanel(
  householdId: string,
): Promise<{ text: string; keyboard: InlineKeyboard }> {
  const cats = await listAllCategories(householdId);
  const active = cats.filter((c) => !c.isArchived);
  const archived = cats.filter((c) => c.isArchived);
  const line = (c: (typeof cats)[number]) => `${c.emoji ? `${c.emoji} ` : ''}${esc(c.name)}`;
  const text = [
    '🏷 <b>Категории этой группы</b>',
    '',
    active.map(line).join(' · ') || 'нет активных',
    ...(archived.length > 0 ? ['', `📦 В архиве: ${archived.map(line).join(' · ')}`] : []),
    '',
    'Переименование меняет отображение во всей истории группы. Для другой статьи расходов заводите новую категорию, а старую отправляйте в архив.',
  ].join('\n');
  return {
    text,
    keyboard: new InlineKeyboard().text('➕ Добавить', 'ca:add').text('✏️ Изменить', 'ca:edit'),
  };
}

async function showCategoriesPanel(ctx: Context, edit: boolean): Promise<void> {
  const hh = await household(ctx);
  const { text, keyboard } = await categoriesPanel(hh.id);
  if (edit) {
    await ctx.editMessageText(text, { parse_mode: 'HTML', reply_markup: keyboard }).catch(() => {});
  } else {
    await ctx.reply(text, { parse_mode: 'HTML', reply_markup: keyboard });
  }
}

categoriesComposer.command('categories', (ctx) => showCategoriesPanel(ctx, false));
categoriesComposer.hears(/^категории$/iu, (ctx) => showCategoriesPanel(ctx, false));

// Контекст force_reply кодируется прямо в тексте подсказки — состояние не нужно.
export async function askForceReply(ctx: Context, prompt: string, code: string): Promise<void> {
  await ctx.reply(`${prompt}\n(код: ${code})`, { reply_markup: { force_reply: true } });
}

categoriesComposer.callbackQuery('ca:add', async (ctx) => {
  await ctx.answerCallbackQuery();
  await askForceReply(ctx, 'Название новой категории:', 'add');
});

categoriesComposer.callbackQuery('ca:edit', async (ctx) => {
  await ctx.answerCallbackQuery();
  const hh = await household(ctx);
  const cats = await listAllCategories(hh.id);
  const kb = new InlineKeyboard();
  for (const c of cats) {
    kb.text(
      `${c.isArchived ? '📦 ' : ''}${c.emoji ? `${c.emoji} ` : ''}${c.name}`,
      `ca:e:${c.id}`,
    ).row();
  }
  kb.text('⬅️ Назад', 'ca:list');
  await ctx.editMessageText('Какую категорию изменить?', { reply_markup: kb }).catch(() => {});
});

categoriesComposer.callbackQuery('ca:list', async (ctx) => {
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

categoriesComposer.callbackQuery(/^ca:e:(.+)$/, async (ctx) => {
  await ctx.answerCallbackQuery();
  await categoryDetail(ctx, ctx.match[1]!);
});

categoriesComposer.callbackQuery(/^ca:rn:(.+)$/, async (ctx) => {
  const cat = await getCategory(ctx.match[1]!);
  await ctx.answerCallbackQuery();
  if (!cat) return;
  await askForceReply(ctx, `Новое название для «${cat.name}»:`, `rn:${cat.id}`);
});

categoriesComposer.callbackQuery(/^ca:al:(.+)$/, async (ctx) => {
  const cat = await getCategory(ctx.match[1]!);
  await ctx.answerCallbackQuery();
  if (!cat) return;
  await askForceReply(
    ctx,
    `Алиасы для «${cat.name}» через запятую (полный список, заменит текущий).\nСейчас: ${cat.aliases.join(', ') || 'нет'}`,
    `al:${cat.id}`,
  );
});

categoriesComposer.callbackQuery(/^ca:em:(.+)$/, async (ctx) => {
  const cat = await getCategory(ctx.match[1]!);
  await ctx.answerCallbackQuery();
  if (!cat) return;
  await askForceReply(ctx, `Emoji для «${cat.name}» (или «-», чтобы убрать):`, `em:${cat.id}`);
});

categoriesComposer.callbackQuery(/^ca:ar:(.+)$/, async (ctx) => {
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

// Ответы на force_reply-подсказки категорий; чужие коды пропускаем дальше по цепочке.
categoriesComposer.on('message:text', async (ctx, next) => {
  const repliedText = ctx.message.reply_to_message?.text;
  const code = repliedText ? /\(код: ([^)]+)\)/.exec(repliedText)?.[1] : undefined;
  if (!code) return next();
  const input = ctx.message.text.trim();

  if (code === 'add') {
    const hh = await household(ctx);
    const created = await createCategory(hh.id, input);
    await ctx.reply(
      created ? `Категория «${created.name}» добавлена ✅` : 'Такая категория уже есть.',
    );
    return;
  }

  const [action, id] = code.split(':');
  if (action !== 'rn' && action !== 'al' && action !== 'em') return next();

  const cat = await getCategory(id!);
  if (!cat) {
    await ctx.reply('Категория не найдена.');
    return;
  }
  if (action === 'rn') {
    await renameCategory(cat.id, input);
    await ctx.reply(`«${cat.name}» → «${input}» ✅ Отображение обновилось во всей истории.`);
  } else if (action === 'al') {
    const aliases = input
      .split(',')
      .map((a) => a.trim().toLowerCase())
      .filter(Boolean);
    await setCategoryAliases(cat.id, aliases);
    await ctx.reply(`Алиасы «${cat.name}»: ${aliases.join(', ') || 'нет'} ✅`);
  } else {
    await setCategoryEmoji(cat.id, input === '-' ? null : input.slice(0, 8));
    await ctx.reply('Emoji обновлён ✅');
  }
});
