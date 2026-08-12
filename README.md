# Lari — shared expense Telegram bot

Record an expense with a single group message such as `67 кафе`. The bot replies with who owes whom and keeps a pinned message with the current balance. Expenses are split equally among participating members, and each group has an independent ledger.

**Stack:** TypeScript, grammY, Drizzle ORM, Supabase Postgres, and Vercel Serverless webhooks.

## Using the bot in a group

- `67 кафе` — a 67 ₾ expense in the Cafe/Restaurants category
- `кафе 67`, `67.5 продукты`, `113 продукты карфур` — alternative order and an optional comment
- `вчера 20 такси`, `24.07 68 продукты` — expenses with a date
- `67` — an uncategorized expense; the bot asks for a category with buttons
- Messages without a number are ignored
- Editing your original message updates the expense
- `/balance`, `/month [07]`, `/last`, `/settle [20]`, `/members`, `/export`, and `/help`

On the first day of every month, the bot posts a summary for the previous month at 10:00 Asia/Tbilisi via Vercel Cron.

A person joins expense splitting through the `✅ Я участвую` button or automatically with their first expense. Leaving prevents new shares from being assigned while preserving existing debt.

Each group has its own categories, history, and balance. Six default categories are created automatically and can be managed with `/categories`. Groups cannot access one another's data; private chats only provide help.

## Setup checklist

### 1. BotFather

1. Run `/newbot`, choose the name `Lari` and a username such as `lari_expenses_bot`, then save the token.
2. In `/mybots` → bot → Bot Settings → Group Privacy, select **Turn off**. Otherwise the bot cannot see regular group messages. If it was already in the group, remove and add it again after changing this setting.
3. Run `/setcommands`, select the bot, and paste:

```text
balance - Show who owes whom
month - Show a monthly summary
last - Show the latest 10 records
settle - Record a settlement
members - Show expense-sharing members
join - Join expense sharing
export - Export history as CSV
help - Explain how to record expenses
```

### 2. Supabase

1. Create a project at [supabase.com](https://supabase.com).
2. Copy the connection string from Project Settings → Database → Connection string → **Transaction pooler** on port 6543. Replace `[YOUR-PASSWORD]` with the database password.

### 3. Local development

```bash
cp .env.example .env   # fill in TELEGRAM_BOT_TOKEN and DATABASE_URL
pnpm install
pnpm db:migrate        # apply migrations
pnpm dev               # run long polling without a tunnel
```

### 4. Telegram group

Create a group and add the bot after disabling privacy mode. Each participant should press `✅ Я участвую`. Give the bot admin rights so it can pin the balance message, or pin that message manually.

### 5. Vercel

1. Push the repository to GitHub and connect it to Vercel with Framework set to Other.
2. Add `TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET` (a random string of at least 32 characters, for example from `openssl rand -hex 32`), `DATABASE_URL`, and `CRON_SECRET` in Project Settings → Environment Variables.
3. Deploy the project.

### 6. Webhook

```bash
# TELEGRAM_WEBHOOK_SECRET must be present in both .env and Vercel
pnpm setwebhook https://<project>.vercel.app/api/telegram
```

To verify it, send `67 кафе` to the group and confirm that the bot replies with the balance. To return to local long polling, run `pnpm delwebhook && pnpm dev`.

## Development

```bash
pnpm check         # typecheck, lint, tests, and formatting
pnpm db:generate   # generate a migration after changing src/db/schema.ts
```

## Safe release process

1. Create a logical snapshot with `pnpm db:backup`; `.backups/` is excluded from Git.
2. Review and apply the migration with `pnpm db:migrate`.
3. Deploy, then smoke-test adding, editing, and deleting an expense plus `/balance`, `/month`, and `/export`.
4. Check the Telegram webhook and Supabase Security Advisor. If the release fails, roll back the Vercel deployment and forward-fix the database schema with another reviewed migration. Restore data from a snapshot only after a separate verification.

The bot uses only a direct server-side Postgres connection. Tables in `public` are protected by RLS and are not intended for access through the Supabase Data API.

Money is stored in integer minor units (1 ₾ = 100 tetri). Every expense records a snapshot of participating members in `expense_shares`, so later membership changes do not recalculate history. Records use soft deletion through `deleted_at`, and message buttons remain valid indefinitely.
