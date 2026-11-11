// Download my data (BE-16, MB-19): a member's own data in one file, never anyone else's, audited, never logged.
// Synthetic users only.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { createKeyRing } from '../src/crypto.ts';
import type { Database } from '../src/db/database.ts';
import { loadRegistry } from '../src/registry.ts';
import { openTestDatabase } from './db.ts';

let logs = '';
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  const config = loadConfig({ APP_ENV: 'test' });
  db = await openTestDatabase();
  await seedPolicyDocuments(db);
  const logStream = new Writable({ write(chunk, _e, cb) { logs += chunk.toString(); cb(); } });
  app = await buildApp({ config, db, auth: await createAuthenticator(config), registry: loadRegistry(), keyRing: createKeyRing(db, randomBytes(32)), logStream });
});
after(async () => { await app.close(); await db.close(); });

async function member() {
  const { accessToken } = (await app.inject({ method: 'POST', url: '/dev/token', payload: {} })).json();
  const call = (method: string, url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer ${accessToken}`, ...extra } });
  const docs = (await call('GET', '/v1/policies/current')).json().items as { id: string; kind: string }[];
  await call('POST', '/v1/me/eligibility', { confirmedAdult: true });
  for (const [purpose, kind] of [['health_processing', 'health_consent'], ['history_storage', 'privacy']]) {
    await call('POST', '/v1/me/consents', { purpose, granted: true, policyDocumentId: docs.find(d => d.kind === kind)!.id, source: 'web' });
  }
  const { id } = (await call('POST', '/v1/assessments', { clientPlatform: 'web' }, { 'idempotency-key': randomUUID() })).json();
  await call('PUT', `/v1/assessments/${id}/profile`, { age: 'profile.age.20-34', country: 'profile.country.NG', cycle: 'profile.cycle.regular', everpreg: 'profile.everpreg.no', plan: 'profile.plan.no' });
  await call('PUT', `/v1/assessments/${id}/answers`, { answers: Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.a` })) });
  await call('POST', `/v1/assessments/${id}/submit`);
  return { call, id };
}

test('the export holds the member\'s results, answers, plan, check-ins and privacy history', async () => {
  const m = await member();
  const goal = (await m.call('POST', '/v1/rlp/goals', { category: 'lifestyle', title: 'Synthetic walk goal', rhythm: 'daily' })).json();
  await m.call('PUT', `/v1/rlp/goals/${goal.id}/checkins/2026-10-01`, { amount: null });
  logs = '';
  const r = await m.call('GET', '/v1/me/export');
  assert.equal(r.statusCode, 200, r.body);
  assert.match(String(r.headers['content-disposition']), /attachment; filename="preconnix-my-data.json"/);
  const x = r.json();
  assert.equal(x.format, 'preconnix-member-export/1');
  assert.ok(x.account.confirmedAdultAt);
  assert.equal(x.privacy.history.length, 2);
  assert.equal(x.assessments.length, 1);
  assert.equal(x.assessments[0].id, m.id);
  assert.equal(Object.keys(x.assessments[0].answers).length, 18);
  assert.ok(x.assessments[0].result.overall.score > 0);
  assert.equal(x.plan.goals[0].title, 'Synthetic walk goal');
  assert.deepEqual(x.plan.allCheckins.map((c: { day: string }) => String(c.day).slice(0, 10)), ['2026-10-01']);
  assert.equal(x.circle.username, null);
  assert.ok(!logs.includes('Synthetic walk goal'), 'export content is never logged');
  const audited = (await db.system.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit.events WHERE action = 'account.export'`)).rows[0].n;
  assert.equal(audited, 1);
});

test('a member\'s export never contains another member\'s data', async () => {
  const a = await member();
  await a.call('POST', '/v1/rlp/goals', { category: 'lifestyle', title: 'Only for member A', rhythm: 'once' });
  const b = await member();
  const x = (await b.call('GET', '/v1/me/export')).json();
  assert.equal(x.assessments.length, 1);
  assert.notEqual(x.assessments[0].id, a.id);
  assert.ok(!JSON.stringify(x).includes('Only for member A'));
});

test('without sign-in there is no export', async () => {
  assert.equal((await app.inject({ method: 'GET', url: '/v1/me/export' })).statusCode, 401);
});

test('a first name from sign-in greets the member on Home, and unusable names are ignored; never logged', async () => {
  const { cleanFirstName } = await import('../src/auth.ts');
  assert.equal(cleanFirstName('  Adaeze '), 'Adaeze');
  assert.equal(cleanFirstName("Mary-Jane O'Neil"), "Mary-Jane O'Neil");
  for (const bad of ['', '<b>x</b>', 'a'.repeat(41), 42, null, 'Ada1']) assert.equal(cleanFirstName(bad), undefined, String(bad));
  const { accessToken } = (await app.inject({ method: 'POST', url: '/dev/token', payload: { firstName: 'Synthadaeze' } })).json();
  logs = '';
  const d = await app.inject({ method: 'GET', url: '/v1/dashboard', headers: { authorization: `Bearer ${accessToken}` } });
  assert.equal(d.json().firstName, 'Synthadaeze');
  assert.ok(!logs.includes('Synthadaeze'));
  const { accessToken: plain } = (await app.inject({ method: 'POST', url: '/dev/token', payload: {} })).json();
  assert.equal((await app.inject({ method: 'GET', url: '/v1/dashboard', headers: { authorization: `Bearer ${plain}` } })).json().firstName, null);
});
