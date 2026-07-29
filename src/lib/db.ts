import 'server-only';

import { Pool } from 'pg';

/**
 * A single pool per process. Next.js dev reloads re-evaluate modules, so the pool is
 * stashed on globalThis to avoid leaking a connection pool on every hot reload.
 */
const globalForDb = globalThis as unknown as { __mcpPool?: Pool };

export function db(): Pool {
  if (!globalForDb.__mcpPool) {
    const connectionString = process.env.DATABASE_URL;

    if (!connectionString) {
      throw new Error('DATABASE_URL is not set.');
    }

    globalForDb.__mcpPool = new Pool({
      connectionString,
      // One pool per *process*, and serverless gives you a process per concurrent
      // request — so this is a multiplier, not a total. Ten instances at max 10 is 100
      // connections, past the ceiling of most managed Postgres tiers. On Vercel, point
      // DATABASE_URL at the provider's pooled endpoint and set DATABASE_POOL_MAX=2.
      max: Number(process.env.DATABASE_POOL_MAX) || 10,
      idleTimeoutMillis: 30_000,
      // Managed Postgres (Supabase, Neon, RDS) terminates plaintext connections.
      ssl: process.env.DATABASE_SSL === 'false' ? undefined : { rejectUnauthorized: false },
    });
  }

  return globalForDb.__mcpPool;
}
