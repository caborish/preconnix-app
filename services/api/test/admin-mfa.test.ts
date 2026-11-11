// Two-step sign-in for staff (PRD F1.2, doc 05 §Admin): outside local and test, a staff token without an MFA claim
// is refused on every /admin route. Member routes are unaffected. Synthetic users only.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { createKeyRing } from '../src/crypto.ts';
import type { Database } from '../src/db/database.ts';
import { loadRegistry } from '../src/registry.ts';
import { openTestDatabase } from './db.ts';

let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  const config = loadConfig({ APP_ENV: 'test', REQUIRE_STAFF_MFA: 'true' });
  assert.equal(config.staffMfa, true);
  db = await openTestDatabase();
  await seedPolicyDocuments(db);
  app = await buildApp({ config, db, auth: await createAuthenticator(config), registry: loadRegistry(), keyRing: createKeyRing(db, randomBytes(32)), logStream: new Writable({ write(_c, _e, cb) { cb(); } }) });
});
after(async () => { await app.close(); await db.close(); });

const token = async (payload: object) => (await app.inject({ method: 'POST', url: '/dev/token', payload })).json().accessToken as string;
const get = (url: string, t: string) => app.inject({ method: 'GET', url, headers: { authorization: `Bearer ${t}` } });

test('staff without two-step sign-in are refused on admin routes; with it they get in', async () => {
  const noMfa = await get('/admin/v1/lessons', await token({ roles: ['content_editor'] }));
  assert.equal(noMfa.statusCode, 403);
  assert.equal(noMfa.json().code, 'mfa_required');
  assert.equal((await get('/admin/v1/lessons', await token({ roles: ['content_editor'], mfa: true }))).statusCode, 200);
});

test('member routes do not need two-step sign-in', async () => {
  assert.equal((await get('/v1/me', await token({}))).statusCode, 200);
});

test('staging and production always require it; local does not', () => {
  const remote = { DATABASE_URL: 'postgres://x', KEY_VAULT_URL: 'https://kv', MEMBER_OIDC_ISSUER: 'i', MEMBER_OIDC_AUDIENCE: 'a', MEMBER_OIDC_JWKS_URL: 'https://j' };
  assert.equal(loadConfig({ APP_ENV: 'staging', ...remote }).staffMfa, true);
  assert.equal(loadConfig({ APP_ENV: 'production', ...remote }).staffMfa, true);
  assert.equal(loadConfig({ APP_ENV: 'local' }).staffMfa, false);
});
