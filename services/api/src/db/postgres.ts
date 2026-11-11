// Azure Database for PostgreSQL (staging/production) and real PostgreSQL in tests. Same contract as PGlite:
// system queries for non-health data, and asUser() transactions running as `app_user` so row-level security applies.
import { readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import pg from 'pg';
import type { Database, Tx } from './database.ts';

const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));
// Any number fixed for the migration lock, so two API replicas never migrate at once.
const MIGRATION_LOCK = 73_401_288;

export interface PostgresOptions {
  /** postgres://user@host:5432/db. The password comes from the environment or a token provider, never the repo. */
  connectionString: string;
  /** Azure requires TLS. Local test containers do not use it. */
  ssl?: boolean;
  /** Entra (managed identity) access token used as the password on Azure. */
  password?: () => Promise<string>;
  max?: number;
}

/** Pool settings. With a token provider the address is split into fields: pg reads `user@host` as an empty
 * password, and a connection string's fields override the separate `password` option. */
export function poolOptions(opts: PostgresOptions): pg.PoolConfig {
  const common = {
    ssl: opts.ssl ? { rejectUnauthorized: true } : undefined,
    max: opts.max ?? 10,
    // Statement text can contain values in error messages; pg never logs them itself, and the API logs only codes.
    application_name: 'preconnix-api'
  };
  if (!opts.password) return { ...common, connectionString: opts.connectionString };
  const url = new URL(opts.connectionString);
  return {
    ...common,
    host: url.hostname,
    port: Number(url.port || 5432),
    user: decodeURIComponent(url.username),
    database: decodeURIComponent(url.pathname.slice(1)),
    password: opts.password
  };
}

export async function openPostgres(opts: PostgresOptions): Promise<Database> {
  const pool = new pg.Pool(poolOptions(opts));

  const client = await pool.connect();
  try {
    await client.query('SELECT pg_advisory_lock($1)', [MIGRATION_LOCK]);
    await client.query('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
    const applied = new Set((await client.query<{ name: string }>('SELECT name FROM public.schema_migrations')).rows.map(r => r.name));
    for (const name of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
      if (applied.has(name)) continue;
      await client.query('BEGIN');
      try {
        await client.query(readFileSync(migrationsDir + name, 'utf8'));
        await client.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [name]);
        await client.query('COMMIT');
      } catch (e) {
        await client.query('ROLLBACK');
        throw e;
      }
    }
    // The API's login role must be able to switch to app_user (SET LOCAL ROLE). On Azure the admin role created
    // app_user (PostgreSQL 16+ gives the creator admin rights but not SET), so it grants itself SET, without
    // inheriting app_user's rights.
    const canSet = await client.query(`SELECT pg_has_role(current_user, 'app_user', 'SET') AS ok`);
    if (!canSet.rows[0].ok) await client.query('GRANT app_user TO CURRENT_USER WITH SET TRUE, INHERIT FALSE');
  } finally {
    await client.query('SELECT pg_advisory_unlock($1)', [MIGRATION_LOCK]).catch(() => undefined);
    client.release();
  }

  const asTx = (c: pg.PoolClient): Tx => ({ query: (sql, params) => c.query(sql, params as unknown[]) as never });

  return {
    system: { query: (sql, params) => pool.query(sql, params as unknown[]) as never },
    async asUser(userId, fn) {
      const c = await pool.connect();
      try {
        await c.query('BEGIN');
        await c.query('SET LOCAL ROLE app_user');
        await c.query("SELECT set_config('app.user_id', $1, true)", [userId]);
        const result = await fn(asTx(c));
        await c.query('COMMIT');
        return result;
      } catch (e) {
        await c.query('ROLLBACK').catch(() => undefined);
        throw e;
      } finally {
        c.release();
      }
    },
    close: () => pool.end()
  };
}
