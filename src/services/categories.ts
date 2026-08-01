import { asc, eq, sql } from 'drizzle-orm';
import { db } from '../db/client';
import { categories, type Category } from '../db/schema';

export async function listActiveCategories(): Promise<Category[]> {
  return db()
    .select()
    .from(categories)
    .where(eq(categories.isArchived, false))
    .orderBy(asc(categories.position));
}

export async function listAllCategories(): Promise<Category[]> {
  return db().select().from(categories).orderBy(asc(categories.position));
}

export async function getCategory(id: string): Promise<Category | undefined> {
  const [row] = await db().select().from(categories).where(eq(categories.id, id));
  return row;
}

export async function createCategory(name: string): Promise<Category | null> {
  const rows = await db()
    .select({ max: sql<number>`coalesce(max(${categories.position}), 0)` })
    .from(categories);
  const max = rows[0]?.max ?? 0;
  const [created] = await db()
    .insert(categories)
    // Название автоматически становится первым алиасом.
    .values({ name, aliases: [name.toLowerCase()], position: max + 1 })
    .onConflictDoNothing()
    .returning();
  return created ?? null;
}

export async function renameCategory(id: string, name: string): Promise<void> {
  await db().update(categories).set({ name }).where(eq(categories.id, id));
}

export async function setCategoryAliases(id: string, aliases: string[]): Promise<void> {
  await db().update(categories).set({ aliases }).where(eq(categories.id, id));
}

export async function setCategoryEmoji(id: string, emoji: string | null): Promise<void> {
  await db().update(categories).set({ emoji }).where(eq(categories.id, id));
}

export async function setCategoryArchived(id: string, isArchived: boolean): Promise<void> {
  await db().update(categories).set({ isArchived }).where(eq(categories.id, id));
}
