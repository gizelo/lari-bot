import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

// The Supabase transaction pooler on port 6543 does not support prepared statements.
// Cache the client at module scope so serverless invocations can reuse it.
let client: ReturnType<typeof postgres> | undefined;

export function db() {
  client ??= postgres(config().DATABASE_URL, { prepare: false, max: 1 });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof db>;
