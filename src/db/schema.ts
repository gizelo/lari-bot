import { sql } from 'drizzle-orm';
import {
  bigint,
  boolean,
  check,
  date,
  foreignKey,
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
  (t) => [
    uniqueIndex('members_household_user_idx').on(t.householdId, t.tgUserId),
    uniqueIndex('members_id_household_idx').on(t.id, t.householdId),
  ],
);

// Each household owns its category set; defaults are seeded when the household is created.
export const categories = pgTable(
  'categories',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    name: text('name').notNull(),
    aliases: text('aliases')
      .array()
      .notNull()
      .default(sql`'{}'::text[]`),
    emoji: text('emoji'),
    position: integer('position').notNull().default(0),
    isArchived: boolean('is_archived').notNull().default(false),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex('categories_household_lower_name_idx').on(t.householdId, sql`lower(${t.name})`),
    uniqueIndex('categories_id_household_idx').on(t.id, t.householdId),
  ],
);

export const expenses = pgTable(
  'expenses',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    kind: text('kind', { enum: ['expense', 'settlement'] }).notNull(),
    categoryId: uuid('category_id'),
    payerId: uuid('payer_id').notNull(),
    amountMinor: bigint('amount_minor', { mode: 'number' }).notNull(),
    comment: text('comment'),
    spentOn: date('spent_on').notNull(),
    tgMessageId: bigint('tg_message_id', { mode: 'number' }),
    tgReplyMessageId: bigint('tg_reply_message_id', { mode: 'number' }),
    sourceKey: text('source_key'),
    createdByTgId: bigint('created_by_tg_id', { mode: 'number' }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
  },
  (t) => [
    check('expenses_amount_positive', sql`${t.amountMinor} > 0`),
    check('expenses_kind_check', sql`${t.kind} in ('expense', 'settlement')`),
    index('expenses_household_spent_on_idx').on(t.householdId, t.spentOn),
    index('expenses_household_deleted_idx').on(t.householdId, t.deletedAt),
    // Idempotency: redelivering an update must not create a duplicate.
    uniqueIndex('expenses_household_message_idx')
      .on(t.householdId, t.tgMessageId)
      .where(sql`${t.tgMessageId} is not null`),
    uniqueIndex('expenses_household_source_idx')
      .on(t.householdId, t.sourceKey)
      .where(sql`${t.sourceKey} is not null`),
    uniqueIndex('expenses_id_household_idx').on(t.id, t.householdId),
    foreignKey({
      columns: [t.payerId, t.householdId],
      foreignColumns: [members.id, members.householdId],
      name: 'expenses_payer_household_fk',
    }),
    foreignKey({
      columns: [t.categoryId, t.householdId],
      foreignColumns: [categories.id, categories.householdId],
      name: 'expenses_category_household_fk',
    }),
  ],
);

// Membership snapshot at entry time. Expenses have one row per participant, including the
// payer; settlements have one row for the recipient and the full amount.
export const expenseShares = pgTable(
  'expense_shares',
  {
    householdId: uuid('household_id')
      .notNull()
      .references(() => households.id),
    expenseId: uuid('expense_id').notNull(),
    memberId: uuid('member_id').notNull(),
    shareMinor: bigint('share_minor', { mode: 'number' }).notNull(),
  },
  (t) => [
    primaryKey({ columns: [t.expenseId, t.memberId] }),
    foreignKey({
      columns: [t.expenseId, t.householdId],
      foreignColumns: [expenses.id, expenses.householdId],
      name: 'expense_shares_expense_household_fk',
    }).onDelete('cascade'),
    foreignKey({
      columns: [t.memberId, t.householdId],
      foreignColumns: [members.id, members.householdId],
      name: 'expense_shares_member_household_fk',
    }),
  ],
);

export type Household = typeof households.$inferSelect;
export type Member = typeof members.$inferSelect;
export type Category = typeof categories.$inferSelect;
export type Expense = typeof expenses.$inferSelect;
export type ExpenseShare = typeof expenseShares.$inferSelect;
