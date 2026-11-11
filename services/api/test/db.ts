// Test database: in-memory PGlite by default; a fresh database on a real PostgreSQL server when
// TEST_DATABASE_URL is set (e.g. postgres://postgres:postgres@localhost:55432/postgres), as on Azure.
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { openPglite, type Database } from '../src/db/database.ts';
import { openPostgres } from '../src/db/postgres.ts';

export async function openTestDatabase(): Promise<Database> {
  const url = process.env.TEST_DATABASE_URL;
  if (!url) return openPglite();
  const name = `test_${randomBytes(6).toString('hex')}`;
  const admin = new pg.Client({ connectionString: url });
  await admin.connect();
  // Roles are shared by every database on the server; create app_user once so parallel test files don't race.
  await admin.query(`DO $$ BEGIN CREATE ROLE app_user NOLOGIN; EXCEPTION WHEN duplicate_object OR unique_violation THEN NULL; END $$`).catch(() => undefined);
  await admin.query(`CREATE DATABASE ${name}`);
  await admin.end();
  const u = new URL(url);
  u.pathname = `/${name}`;
  const db = await openPostgres({ connectionString: u.toString(), max: 4 });
  return {
    ...db,
    async close() {
      await db.close();
      const c = new pg.Client({ connectionString: url });
      await c.connect();
      await c.query(`DROP DATABASE IF EXISTS ${name} WITH (FORCE)`);
      await c.end();
    }
  };
}
