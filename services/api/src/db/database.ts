// Database access. Local and tests: PGlite (ADR-014). Azure PostgreSQL adapter comes with staging (BE-17).
import { PGlite } from '@electric-sql/pglite';
import { mkdirSync, readdirSync, readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';

export interface Tx {
  query<T = Record<string, unknown>>(sql: string, params?: unknown[]): Promise<{ rows: T[] }>;
}

export interface Database {
  /** System queries (account bootstrap, policy documents). Never used for health data. */
  system: Tx;
  /** Runs `fn` as `app_user` with `app.user_id` set, so row-level security limits every query to this user. */
  /** Runs `fn` in one transaction as the member, so row-level security applies. Return the response body from `fn`
   *  and let the route send it: sending the reply inside `fn` answers before the commit, so a client that reads
   *  straight back can miss the write. */
  asUser<T>(userId: string, fn: (tx: Tx) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}

const migrationsDir = fileURLToPath(new URL('./migrations/', import.meta.url));

export async function openPglite(dataDir?: string): Promise<Database> {
  if (dataDir) mkdirSync(dataDir, { recursive: true });
  const pg = dataDir ? new PGlite(dataDir) : new PGlite();
  await pg.exec('CREATE TABLE IF NOT EXISTS public.schema_migrations (name text PRIMARY KEY, applied_at timestamptz NOT NULL DEFAULT now())');
  const applied = new Set((await pg.query<{ name: string }>('SELECT name FROM public.schema_migrations')).rows.map(r => r.name));
  for (const name of readdirSync(migrationsDir).filter(f => f.endsWith('.sql')).sort()) {
    if (applied.has(name)) continue;
    await pg.transaction(async tx => {
      await tx.exec(readFileSync(migrationsDir + name, 'utf8'));
      await tx.query('INSERT INTO public.schema_migrations (name) VALUES ($1)', [name]);
    });
  }

  return {
    system: { query: (sql, params) => pg.query(sql, params) as never },
    asUser: (userId, fn) =>
      pg.transaction(async tx => {
        await tx.query('SET LOCAL ROLE app_user');
        await tx.query("SELECT set_config('app.user_id', $1, true)", [userId]);
        return fn({ query: (sql, params) => tx.query(sql, params) as never });
      }),
    close: () => pg.close()
  };
}
