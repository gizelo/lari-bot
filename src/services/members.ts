import { and, eq } from 'drizzle-orm';
import { db } from '../db/client.js';
import { members, type Member } from '../db/schema.js';

export async function ensureMember(
  householdId: string,
  tgUserId: number,
  displayName: string,
): Promise<Member> {
  const [existing] = await db()
    .select()
    .from(members)
    .where(and(eq(members.householdId, householdId), eq(members.tgUserId, tgUserId)));
  if (existing) {
    if (!existing.isActive || existing.displayName !== displayName) {
      await db()
        .update(members)
        .set({ isActive: true, displayName })
        .where(eq(members.id, existing.id));
    }
    return { ...existing, isActive: true, displayName };
  }
  const [created] = await db()
    .insert(members)
    .values({ householdId, tgUserId, displayName })
    .onConflictDoNothing()
    .returning();
  if (created) return created;
  const [row] = await db()
    .select()
    .from(members)
    .where(and(eq(members.householdId, householdId), eq(members.tgUserId, tgUserId)));
  return row!;
}

/** Обновляет имя существующего участника; не создаёт нового. */
export async function touchDisplayName(
  householdId: string,
  tgUserId: number,
  displayName: string,
): Promise<Member | undefined> {
  const [existing] = await db()
    .select()
    .from(members)
    .where(and(eq(members.householdId, householdId), eq(members.tgUserId, tgUserId)));
  if (existing && existing.displayName !== displayName) {
    await db().update(members).set({ displayName }).where(eq(members.id, existing.id));
    return { ...existing, displayName };
  }
  return existing;
}

export async function deactivateMember(householdId: string, tgUserId: number): Promise<void> {
  await db()
    .update(members)
    .set({ isActive: false })
    .where(and(eq(members.householdId, householdId), eq(members.tgUserId, tgUserId)));
}

export async function listActiveMembers(householdId: string): Promise<Member[]> {
  return db()
    .select()
    .from(members)
    .where(and(eq(members.householdId, householdId), eq(members.isActive, true)))
    .orderBy(members.createdAt);
}

export async function listAllMembers(householdId: string): Promise<Member[]> {
  return db()
    .select()
    .from(members)
    .where(eq(members.householdId, householdId))
    .orderBy(members.createdAt);
}

export function memberNames(all: Member[]): Map<string, string> {
  return new Map(all.map((m) => [m.id, m.displayName]));
}
