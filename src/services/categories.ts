import { and, asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client.js';
import { categories, type Category } from '../db/schema.js';

export const DEFAULT_CATEGORIES = [
  {
    name: 'Продукты',
    aliases: ['продукты', 'еда', 'магазин', 'супермаркет', 'магаз'],
    emoji: '🛒',
  },
  {
    name: 'Кафе/рестораны',
    aliases: ['кафе', 'ресторан', 'рестик', 'кофе', 'бар', 'доставка'],
    emoji: '🍽',
  },
  { name: 'Транспорт', aliases: ['транспорт', 'такси', 'метро', 'бензин', 'автобус'], emoji: '🚕' },
  { name: 'Развлечения', aliases: ['развлечения', 'кино', 'досуг', 'концерт'], emoji: '🎬' },
  { name: 'Дом/быт', aliases: ['дом', 'быт', 'хозтовары', 'химия', 'ремонт'], emoji: '🏠' },
  { name: 'Прочее', aliases: ['прочее', 'другое', 'разное'], emoji: '📦' },
];

export async function seedDefaultCategories(householdId: string): Promise<void> {
  await db()
    .insert(categories)
    .values(DEFAULT_CATEGORIES.map((c, position) => ({ ...c, householdId, position })))
    .onConflictDoNothing();
}

export async function listActiveCategories(householdId: string): Promise<Category[]> {
  return db()
    .select()
    .from(categories)
    .where(and(eq(categories.householdId, householdId), eq(categories.isArchived, false)))
    .orderBy(asc(categories.position));
}

export async function listAllCategories(householdId: string): Promise<Category[]> {
  return db()
    .select()
    .from(categories)
    .where(eq(categories.householdId, householdId))
    .orderBy(asc(categories.position));
}

export async function getCategory(householdId: string, id: string): Promise<Category | undefined> {
  const [row] = await db()
    .select()
    .from(categories)
    .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
  return row;
}

export async function createCategory(householdId: string, name: string): Promise<Category | null> {
  const rows = await db()
    .select({ max: sql<number>`coalesce(max(${categories.position}), 0)` })
    .from(categories)
    .where(eq(categories.householdId, householdId));
  const max = rows[0]?.max ?? 0;
  const [created] = await db()
    .insert(categories)
    // The category name is always its first alias.
    .values({ householdId, name, aliases: [name.toLowerCase()], position: max + 1 })
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

export async function renameCategory(householdId: string, id: string, name: string): Promise<void> {
  await db()
    .update(categories)
    .set({ name })
    .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
}

export async function setCategoryAliases(
  householdId: string,
  id: string,
  aliases: string[],
): Promise<void> {
  await db()
    .update(categories)
    .set({ aliases })
    .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
}

export async function setCategoryEmoji(
  householdId: string,
  id: string,
  emoji: string | null,
): Promise<void> {
  await db()
    .update(categories)
    .set({ emoji })
    .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
}

export async function setCategoryArchived(
  householdId: string,
  id: string,
  isArchived: boolean,
): Promise<void> {
  await db()
    .update(categories)
    .set({ isArchived })
    .where(and(eq(categories.id, id), eq(categories.householdId, householdId)));
}
