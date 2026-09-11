import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import { config } from '../config.js';
import * as schema from './schema.js';

let client: ReturnType<typeof postgres> | undefined;

export function db() {
  client ??= postgres(config().DATABASE_URL, {
    prepare: false,
    max: 1,
    ssl: true,
    connect_timeout: 10,
    idle_timeout: 20,
  });
  return drizzle(client, { schema });
}

export type Db = ReturnType<typeof db>;
