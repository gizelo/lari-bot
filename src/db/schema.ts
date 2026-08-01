import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  index,
  integer,
  pgTable,
  primaryKey,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from 'drizzle-orm/pg-core';

export const households = pgTable('households', {
  id: uuid('id').primaryKey().defaultRandom(),
  tgChatId: bigint('tg_chat_id', { mode: 'number' }).notNull().unique(),
  title: text('title').notNull(),
  currency: text('currency').notNull().default('GEL'),
  pinnedMessageId: bigint('pinned_message_id', { mode: 'number' }),
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
});

export const members = pgTable(
  'members',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    tgUserId: bigint('tg_user_id', { mode: 'number' }).notNull(),
    displayName: text('display_name').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('members_household_user_idx').on(t.householdId, t.tgUserId)],
);

// Глобальные для всех групп, управляются только админом из лички.
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    name: text('name').notNull(),
    aliases: text('aliases').array().notNull().default(sql`'{}'::text[]`),
    emoji: text('emoji'),
    position: integer('position').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [uniqueIndex('categories_lower_name_idx').on(sql`lower(${t.name})`)],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    kind: text('kind', { enum: ['expense', 'settlement'] }).notNull(),
    categoryId: uuid('category_id').references(() => categories.id),
    payerId: uuid('payer_id')
      .notNull()
      .references(() => members.id),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    comment: text('comment'),
    spentOn: date('spent_on').notNull(),
    tgMessageId: bigint('tg_message_id', { mode: 'number' }),
    tgReplyMessageId: bigint('tg_reply_message_id', { mode: 'number' }),
    createdByTgId: bigint('created_by_tg_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    check('expenses_amount_positive', sql`${t.amountMinor} > 0`),
    check('expenses_kind_check', sql`${t.kind} in ('expense', 'settlement')`),
    index('expenses_household_spent_on_idx').on(t.householdId, t.spentOn),
    index('expenses_household_deleted_idx').on(t.householdId, t.deletedAt),
    // Идемпотентность: повторная доставка апдейта не создаёт дубль.
    uniqueIndex('expenses_household_message_idx')
      .on(t.householdId, t.tgMessageId)
      .where(sql`${t.tgMessageId} is not null`),
  ],
);

// Снапшот дележа на момент внесения. Для expense — по строке на участника (включая
// плательщика), для settlement — одна строка с получателем на полную сумму.
export const expenseShares = pgTable(
  'expense_shares',
  {
    expenseId: uuid('expense_id')
      .notNull()
      .references(() => expenses.id, { onDelete: 'cascade' }),
    memberId: uuid('member_id')
      .notNull()
      .references(() => members.id),
    shareMinor: bigint('share_minor', { mode: 'number' }).notNull(),
  },
  (t) => [primaryKey({ columns: [t.expenseId, t.memberId] })],
);

export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseShare = typeof expenseShares.$inferSelect;
