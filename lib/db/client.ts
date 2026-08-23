/**
 * Drizzle client (server-only). Reads DATABASE_URL from env.
 *
 * Supabase exposes a "connection pooler" URL for serverless workloads and a
 * "direct" URL for migrations. Use the pooler URL for app reads/writes and
 * the direct URL via `drizzle.config.ts` for `pnpm db:migrate`.
 */

import 'server-only';
import { drizzle } from 'drizzle-orm/postgres-js';
import postgres from 'postgres';
import * as schema from './schema';

const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error('DATABASE_URL is not set. See .env.example.');
}

// Reuse a single client across HMR reloads in dev.
const globalForDb = globalThis as unknown as { _pg?: ReturnType<typeof postgres> };
const client = globalForDb._pg ?? postgres(connectionString, { prepare: false });
if (process.env.NODE_ENV !== 'production') globalForDb._pg = client;

export const db = drizzle(client, { schema });
export { schema };
