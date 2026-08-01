import { eq } from 'drizzle-orm';
import { db } from '../db/client';
import { households, type Household } from '../db/schema';

export async function getOrCreateHousehold(tgChatId: number, title: string): Promise<Household> {
  const [existing] = await db().select().from(households).where(eq(households.tgChatId, tgChatId));
  if (existing) {
    if (existing.title !== title) {
      await db().update(households).set({ title }).where(eq(households.id, existing.id));
    }
    return { ...existing, title };
  }
  const [created] = await db()
    .insert(households)
    .values({ tgChatId, title })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  // Гонка двух апдейтов: запись уже вставлена параллельной инвокацией.
  const [row] = await db().select().from(households).where(eq(households.tgChatId, tgChatId));
  return row!;
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
