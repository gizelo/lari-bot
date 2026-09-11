import { mkdir, writeFile } from 'node:fs/promises';
import { resolve } from 'node:path';
import postgres from 'postgres';
import { loadDotenv } from '../src/env.js';

loadDotenv();

const databaseUrl = process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
if (!databaseUrl) throw new Error('DATABASE_URL is required');

const outputDir = resolve(process.argv[2] ?? '.backups');
const timestamp = new Date().toISOString().replaceAll(':', '-');
const outputPath = resolve(outputDir, `lari-bot-${timestamp}.json`);
const sql = postgres(databaseUrl, { prepare: false, max: 1, ssl: true, connect_timeout: 10 });

try {
  const { migrations, households, members, categories, expenses, expenseShares } = await sql.begin(
    'isolation level repeatable read read only',
    async (tx) => {
      const [history] = await tx`select to_regclass('drizzle.__drizzle_migrations') as drizzle,
        to_regclass('supabase_migrations.schema_migrations') as supabase`;
      const migrations = history?.drizzle
        ? await tx`select id, hash, created_at from drizzle.__drizzle_migrations order by id`
        : history?.supabase
          ? await tx`select version, name from supabase_migrations.schema_migrations order by version`
          : [];
      const households = await tx`select * from public.households order by id`;
      const members = await tx`select * from public.members order by id`;
      const categories = await tx`select * from public.categories order by id`;
      const expenses = await tx`select * from public.expenses order by id`;
      const expenseShares =
        await tx`select * from public.expense_shares order by expense_id, member_id`;
      return { migrations, households, members, categories, expenses, expenseShares };
    },
  );
  const snapshot = {
    createdAt: new Date().toISOString(),
    schemaMigrations: migrations,
    tables: { households, members, categories, expenses, expenseShares },
  };
  await mkdir(outputDir, { recursive: true });
  await writeFile(outputPath, `${JSON.stringify(snapshot, null, 2)}\n`, { mode: 0o600 });
  console.log(outputPath);
} finally {
  await sql.end({ timeout: 5 });
}
