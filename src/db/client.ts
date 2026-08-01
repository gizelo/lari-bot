import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config';
import * as schema from './schema';

// Transaction pooler Supabase (порт 6543) не поддерживает prepared statements.
// Клиент кэшируется в module scope — переиспользуется между инвокациями serverless.
let client: ReturnType<typeof postgres> | undefined;

export function db() {
  client ??= postgres(config().DATABASE_URL, { prepare: false, max: 1 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof db>;
