import { eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { households, type Household } from '../db/schema.js';
import { categories } from '../db/schema.js';
import { DEFAULT_CATEGORIES, seedDefaultCategories } from './categories.js';

export async function getOrCreateHousehold(tgChatId: number, title: string): Promise<Household> {
  const [existing] = await db().select().from(households).where(eq(households.tgChatId, tgChatId));
  if (existing) {
    await seedDefaultCategories(existing.id);
    if (existing.title !== title) {
      await db().update(households).set({ title }).where(eq(households.id, existing.id));
    }
    return { ...existing, title };
  }
  const created = await db().transaction(async (tx) => {
    const [row] = await tx
      .insert(households)
      .values({ tgChatId, title })
      .onConflictDoNothing()
      .returning();
    if (!row) return undefined;
    await tx
      .insert(categories)
      .values(
        DEFAULT_CATEGORIES.map((category, position) => ({
          ...category,
          householdId: row.id,
          position,
        })),
      )
      .onConflictDoNothing();
    return row;
  });
  if (created) {
    return created;
  }
  // A concurrent invocation may have inserted the household first.
  const [row] = await db().select().from(households).where(eq(households.tgChatId, tgChatId));
  if (!row) throw new Error('Household creation race could not be resolved');
  await seedDefaultCategories(row.id);
  return row;
}

export async function setPinnedMessage(householdId: string, messageId: number): Promise<void> {
  await db()
    .update(households)
    .set({ pinnedMessageId: messageId })
    .where(eq(households.id, householdId));
}

export async function migrateChatId(oldChatId: number, newChatId: number): Promise<void> {
  await db()
    .update(households)
    .set({ tgChatId: newChatId })
    .where(eq(households.tgChatId, oldChatId));
}

export async function getHouseholdById(id: string): Promise<Household | undefined> {
  const [row] = await db().select().from(households).where(eq(households.id, id));
  return row;
}

export async function listHouseholds(): Promise<Household[]> {
  return db().select().from(households).orderBy(households.createdAt);
}
