// API behaviour on an in-memory PGlite database with synthetic users only.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { readFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { createKeyRing } from '../src/crypto.ts';
import { randomBytes } from 'node:crypto';
import { loadConfig } from '../src/config.ts';
import type { Database } from '../src/db/database.ts';
import { openTestDatabase } from './db.ts';
import { loadRegistry } from '../src/registry.ts';

const root = fileURLToPath(new URL('../../../', import.meta.url));
const golden = JSON.parse(readFileSync(root + 'contracts/conformance/scoring/rra-legacy-1.0.0.golden.json', 'utf8'));

let logs = '';
const logStream = new Writable({ write(chunk, _enc, cb) { logs += chunk.toString(); cb(); } });

let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
let healthConsentDoc: string;
let privacyDoc: string;

before(async () => {
  const config = loadConfig({ APP_ENV: 'test' });
  db = await openTestDatabase();
  await seedPolicyDocuments(db);
  app = await buildApp({ config, db, auth: await createAuthenticator(config), registry: loadRegistry(), keyRing: createKeyRing(db, randomBytes(32)), logStream });
  const docs = (await app.inject({ method: 'GET', url: '/v1/policies/current' })).json().items as { id: string; kind: string }[];
  healthConsentDoc = docs.find(d => d.kind === 'health_consent')!.id;
  privacyDoc = docs.find(d => d.kind === 'privacy')!.id;
});
after(async () => { await app.close(); await db.close(); });

async function newUser() {
  const { accessToken } = (await app.inject({ method: 'POST', url: '/dev/token', payload: {} })).json();
  const h = { authorization: `Bearer ${accessToken}` };
  const call = (method: string, url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url, payload: payload as object, headers: { ...h, ...extra } });
  return { call };
}

async function readyUser({ saveHistory = true } = {}) {
  const u = await newUser();
  assert.equal((await u.call('POST', '/v1/me/eligibility', { confirmedAdult: true })).statusCode, 204);
  assert.equal((await u.call('POST', '/v1/me/consents', { purpose: 'health_processing', granted: true, policyDocumentId: healthConsentDoc, source: 'ios' })).statusCode, 201);
  if (saveHistory) {
    assert.equal((await u.call('POST', '/v1/me/consents', { purpose: 'history_storage', granted: true, policyDocumentId: privacyDoc, source: 'ios' })).statusCode, 201);
  }
  return u;
}

const profileIds = (p: { age: string; plan: string; everpreg: string; country?: string }) => ({
  age: `profile.age.${p.age}`, country: `profile.country.${p.country ?? 'NG'}`, cycle: 'profile.cycle.regular',
  everpreg: `profile.everpreg.${p.everpreg}`, plan: `profile.plan.${p.plan}`
});
const SUFFIX: Record<string, string> = { '2': 'a', '1': 'b', '0': 'c' };

async function draft(u: Awaited<ReturnType<typeof newUser>>, profile: Parameters<typeof profileIds>[0]) {
  const created = await u.call('POST', '/v1/assessments', { clientPlatform: 'ios' }, { 'idempotency-key': randomUUID() });
  assert.equal(created.statusCode, 201);
  const id = created.json().id as string;
  const p = await u.call('PUT', `/v1/assessments/${id}/profile`, profileIds(profile));
  assert.equal(p.statusCode, 200, p.body);
  return { id, profile: p.json() };
}

describe('public endpoints', () => {
  test('health', async () => {
    assert.deepEqual((await app.inject({ method: 'GET', url: '/v1/health' })).json(), { status: 'ok' });
  });

  test('current definition is version 1.1, offers Nigeria and Canada, and carries no scores', async () => {
    const res = await app.inject({ method: 'GET', url: '/v1/assessment-definitions/current' });
    const def = res.json();
    assert.equal(def.definitionId, 'rra-defs-1.1');
    assert.deepEqual(def.profile.find((f: { id: string }) => f.id === 'country').options.map((o: { value: string }) => o.value), ['NG', 'CA']);
    assert.doesNotMatch(res.body, /"(score|points|itemPoints)"/);
  });
});

describe('sign-in', () => {
  test('health data endpoints need a valid token', async () => {
    assert.equal((await app.inject({ method: 'GET', url: '/v1/assessments' })).statusCode, 401);
    assert.equal((await app.inject({ method: 'GET', url: '/v1/assessments', headers: { authorization: 'Bearer abc.def.ghi' } })).statusCode, 401);
  });

  test('a token from another signer is rejected', async () => {
    const other = await createAuthenticator(loadConfig({ APP_ENV: 'test' }));
    const forged = await other.issueDevToken!('dev-forged');
    assert.equal((await app.inject({ method: 'GET', url: '/v1/me', headers: { authorization: `Bearer ${forged}` } })).statusCode, 401);
  });

  test('the dev sign-in does not exist outside local/test', async () => {
    await assert.rejects(createAuthenticator(loadConfig({
      APP_ENV: 'staging', DATABASE_URL: 'postgres://api@server/db', KEY_VAULT_URL: 'https://kv.vault.azure.net/',
      MEMBER_OIDC_ISSUER: 'x', MEMBER_OIDC_AUDIENCE: 'y', MEMBER_OIDC_JWKS_URL: 'https://login.example.test/keys',
      OIDC_ISSUER: 'x', OIDC_AUDIENCE: 'y', OIDC_JWKS_URL: 'https://login.example.test/keys' }))
      .then(a => { if (a.issueDevToken) throw new Error('dev signer present'); throw new Error('ok'); }), /ok/);
  });
});

describe('assessment journey', () => {
  test('golden cases scored through the API match the legacy website', async () => {
    const u = await readyUser();
    const picks = [0, 3, 8, 50, 400, 900, 1500, 2200, 3000].map(i => golden.cases[i]);
    for (const c of picks) {
      const { id } = await draft(u, c);
      const order = golden.questionOrder[c.plan === 'no' ? 'P2' : c.everpreg === 'yes' ? 'P1_everpreg' : 'P1_neverpreg'] as string[];
      const answers = order.map((q, j) => ({ questionId: q, optionId: `${q}.${SUFFIX[c.answers[j]]}` }));
      assert.equal((await u.call('PUT', `/v1/assessments/${id}/answers`, { answers })).statusCode, 204);
      const r = await u.call('POST', `/v1/assessments/${id}/submit`);
      assert.equal(r.statusCode, 200, r.body);
      const body = r.json();
      assert.deepEqual(
        { score: body.overall.score, band: body.overall.bandLabel, domains: body.domains.map((d: { percent: number }) => d.percent) },
        { ...c.expected, band: c.expected.band.replace(/ Readiness$/, '') } // bands renamed, 5 Nov 2026
      );
      assert.equal(body.scoringPolicyId, 'rra-1.1.0');
      assert.equal(body.scoringStatus, 'legacy_unvalidated');
    }
  });

  test('submitting twice returns the same stored result', async () => {
    const u = await readyUser();
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    const answers = Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.a` }));
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers });
    const a = (await u.call('POST', `/v1/assessments/${id}/submit`)).json();
    const b = (await u.call('POST', `/v1/assessments/${id}/submit`)).json();
    assert.equal(a.resultSha256, b.resultSha256);
    assert.equal(a.overall.score, 100);
    assert.equal((await u.call('GET', `/v1/assessments/${id}/result`)).json().resultSha256, a.resultSha256);
    assert.equal((await u.call('PUT', `/v1/assessments/${id}/answers`, { answers })).statusCode, 409);
  });

  test('without health consent, submit is refused with 412', async () => {
    const u = await newUser();
    await u.call('POST', '/v1/me/eligibility', { confirmedAdult: true });
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    const r = await u.call('POST', `/v1/assessments/${id}/submit`);
    assert.equal(r.statusCode, 412);
    assert.equal(r.json().code, 'consent_required');
  });

  test('without the 18+ confirmation, submit is refused with 412', async () => {
    const u = await newUser();
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    assert.equal((await u.call('POST', `/v1/assessments/${id}/submit`)).json().code, 'eligibility_required');
  });

  test('incomplete assessments are refused with the missing question ids', async () => {
    const u = await readyUser();
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'n1', optionId: 'n1.a' }] });
    const r = await u.call('POST', `/v1/assessments/${id}/submit`);
    assert.equal(r.statusCode, 409);
    assert.equal(r.json().missingQuestionIds.length, 17);
  });

  test('answers for questions that do not apply, or wrong options, are rejected', async () => {
    const u = await readyUser();
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    assert.equal((await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'b10', optionId: 'b10.a' }] })).json().code, 'question_not_applicable');
    assert.equal((await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'n1', optionId: 'n2.a' }] })).json().code, 'invalid_option');
  });

  test('a client cannot send its own score', async () => {
    const u = await readyUser();
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    const r = await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'n1', optionId: 'n1.a', score: 2 }] });
    assert.equal(r.statusCode, 400);
  });

  test('changing the plan removes answers that no longer apply', async () => {
    const u = await readyUser();
    const { id, profile } = await draft(u, { age: '20-34', plan: 'yes', everpreg: 'yes' });
    assert.deepEqual(profile.applicableSections, ['P1B', 'P1C', 'P1D', 'P1E']);
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'b10', optionId: 'b10.a' }, { questionId: 'c19', optionId: 'c19.b' }] });
    const changed = (await u.call('PUT', `/v1/assessments/${id}/profile`, profileIds({ age: '20-34', plan: 'yes', everpreg: 'no' }))).json();
    assert.deepEqual(changed.purgedQuestionIds, ['b10']);
    assert.deepEqual((await u.call('GET', `/v1/assessments/${id}`)).json().answers, { c19: 'c19.b' });
  });

  test('results carry the country, for country-specific links such as booking', async () => {
    const u = await readyUser();
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no', country: 'NG' });
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.a` })) });
    assert.equal((await u.call('POST', `/v1/assessments/${id}/submit`)).json().country, 'NG');
    assert.equal((await u.call('GET', `/v1/assessments/${id}/result`)).json().country, 'NG');
  });

  test('Canada is accepted as a country', async () => {
    const u = await readyUser();
    const { profile } = await draft(u, { age: '35-39', plan: 'unsure', everpreg: 'no', country: 'CA' });
    assert.equal(profile.pathway, 'pregnancy_planning');
  });
});

describe('history and consent choices', () => {
  const allTop = Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.a` }));

  test('without the history consent the result is shown once and nothing is kept', async () => {
    const u = await readyUser({ saveHistory: false });
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: allTop });
    const r = (await u.call('POST', `/v1/assessments/${id}/submit`)).json();
    assert.equal(r.overall.score, 100);
    assert.equal(r.saved, false);
    assert.equal((await u.call('GET', `/v1/assessments/${id}`)).statusCode, 404);
    assert.equal((await u.call('GET', '/v1/assessments')).json().items.length, 0);
    const left = await db.system.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.assessment_answers WHERE assessment_id = $1', [id]);
    assert.equal(left.rows[0].n, 0);
  });

  test('with the history consent results are listed newest first and can be reopened', async () => {
    const u = await readyUser();
    for (const plan of ['no', 'no']) {
      const { id } = await draft(u, { age: '20-34', plan, everpreg: 'no' });
      await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: allTop });
      assert.equal((await u.call('POST', `/v1/assessments/${id}/submit`)).json().saved, true);
    }
    const items = (await u.call('GET', '/v1/assessments')).json().items.filter((a: { status: string }) => a.status === 'scored');
    assert.equal(items.length, 2);
    assert.ok(items[0].startedAt >= items[1].startedAt);
    assert.equal((await u.call('GET', `/v1/assessments/${items[0].id}/result`)).json().overall.score, 100);
  });

  test('withdrawing a consent adds a new record and /v1/me shows the latest choice', async () => {
    const u = await readyUser();
    await u.call('POST', '/v1/me/consents', { purpose: 'history_storage', granted: false, policyDocumentId: privacyDoc, source: 'ios' });
    const me = (await u.call('GET', '/v1/me')).json();
    assert.equal(me.consents.find((c: { purpose: string }) => c.purpose === 'history_storage').granted, false);
    assert.equal(me.consents.find((c: { purpose: string }) => c.purpose === 'health_processing').granted, true);
    const rows = await db.system.query<{ n: number }>(`SELECT count(*)::int AS n FROM identity.consents WHERE purpose = 'history_storage' AND granted = false`);
    assert.ok(rows.rows[0].n >= 1);
  });

  test('delete all removes every saved assessment for this user only', async () => {
    const a = await readyUser();
    const b = await readyUser();
    for (const u of [a, b]) {
      const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
      await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: allTop });
      await u.call('POST', `/v1/assessments/${id}/submit`);
    }
    assert.equal((await a.call('DELETE', '/v1/assessments')).json().deleted, 1);
    assert.equal((await a.call('GET', '/v1/assessments')).json().items.length, 0);
    assert.equal((await b.call('GET', '/v1/assessments')).json().items.length, 1);
  });

  test('withdrawing health-processing consent blocks new results', async () => {
    const u = await readyUser();
    await u.call('POST', '/v1/me/consents', { purpose: 'health_processing', granted: false, policyDocumentId: healthConsentDoc, source: 'ios' });
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: allTop });
    assert.equal((await u.call('POST', `/v1/assessments/${id}/submit`)).json().code, 'consent_required');
  });
});

describe('website scoring without an account (BE-18)', () => {
  const allTop = Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.a` }));
  const body = { profile: profileIds({ age: '20-34', plan: 'no', everpreg: 'no' }), answers: allTop };
  const post = (payload: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: 'POST', url: '/v1/public/score', payload: payload as object, headers: { 'x-forwarded-for': `203.0.113.${Math.floor(Math.random() * 250)}`, ...headers } });

  test('scores with the same engine as a signed-in submission, and stores nothing', async () => {
    const before = (await db.system.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.assessments')).rows[0].n;
    const r = await post(body);
    assert.equal(r.statusCode, 200, r.body);
    const web = r.json();
    const u = await readyUser({ saveHistory: false });
    const { id } = await draft(u, { age: '20-34', plan: 'no', everpreg: 'no' });
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: allTop });
    const app_ = (await u.call('POST', `/v1/assessments/${id}/submit`)).json();
    assert.deepEqual({ o: web.overall, d: web.domains, s: web.resultSha256, saved: web.saved, id: web.assessmentId },
      { o: app_.overall, d: app_.domains, s: app_.resultSha256, saved: false, id: null });
    const after = (await db.system.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.assessments')).rows[0].n;
    assert.equal(after, before, 'the website score stored nothing (and the unsaved signed-in draft was discarded)');
  });

  test('incomplete or invalid answers and client-sent scores are refused', async () => {
    assert.equal((await post({ ...body, answers: allTop.slice(0, 5) })).statusCode, 409);
    assert.equal((await post({ ...body, answers: [...allTop.slice(1), { questionId: 'n1', optionId: 'n1.z' }] })).statusCode, 422);
    assert.equal((await post({ ...body, score: 100 })).statusCode, 400);
  });

  test('each visitor address is limited to 20 scores in 10 minutes', async () => {
    const ip = { 'x-forwarded-for': '198.51.100.7' };
    for (let i = 0; i < 20; i++) assert.equal((await post(body, ip)).statusCode, 200);
    assert.equal((await post(body, ip)).statusCode, 429);
    assert.equal((await post(body, { 'x-forwarded-for': '198.51.100.8' })).statusCode, 200, 'other visitors unaffected');
  });

  test('the website origin may call member and public routes from a browser, never staff routes', async () => {
    const origin = 'http://localhost:8085';
    const pre = await app.inject({ method: 'OPTIONS', url: '/v1/public/score', headers: { origin, 'access-control-request-method': 'POST' } });
    assert.equal(pre.headers['access-control-allow-origin'], origin);
    assert.match(String(pre.headers['access-control-allow-headers']), /idempotency-key/, 'saving from the website sends the duplicate-save key');
    const admin = await app.inject({ method: 'OPTIONS', url: '/admin/v1/me', headers: { origin, 'access-control-request-method': 'GET' } });
    assert.equal(admin.headers['access-control-allow-origin'], undefined);
    const other = await app.inject({ method: 'OPTIONS', url: '/v1/public/score', headers: { origin: 'https://evil.example', 'access-control-request-method': 'POST' } });
    assert.equal(other.headers['access-control-allow-origin'], undefined);
  });
});

describe('account deletion', () => {
  const allTop = Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.a` }));

  test('deleting the account removes everything, keeps only an audit record, and leaves others untouched', async () => {
    const { accessToken, subject } = (await app.inject({ method: 'POST', url: '/dev/token', payload: {} })).json();
    const call = (method: string, url: string, payload?: unknown) =>
      app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer ${accessToken}` } });
    await call('POST', '/v1/me/eligibility', { confirmedAdult: true });
    await call('POST', '/v1/me/consents', { purpose: 'health_processing', granted: true, policyDocumentId: healthConsentDoc, source: 'ios' });
    await call('POST', '/v1/me/consents', { purpose: 'history_storage', granted: true, policyDocumentId: privacyDoc, source: 'ios' });
    const created = (await app.inject({ method: 'POST', url: '/v1/assessments', payload: { clientPlatform: 'ios' },
      headers: { authorization: `Bearer ${accessToken}`, 'idempotency-key': randomUUID() } })).json();
    await call('PUT', `/v1/assessments/${created.id}/profile`, profileIds({ age: '20-34', plan: 'no', everpreg: 'no' }));
    await call('PUT', `/v1/assessments/${created.id}/answers`, { answers: allTop });
    await call('POST', `/v1/assessments/${created.id}/submit`);
    await call('POST', '/v1/rlp/goals', { category: 'other', title: 'Walk', rhythm: 'daily' });
    const id = (await db.system.query<{ id: string }>('SELECT id FROM identity.users WHERE idp_subject = $1', [subject])).rows[0].id;
    const other = await readyUser();

    assert.equal((await call('DELETE', '/v1/me', {})).statusCode, 400, 'needs the confirmation');
    assert.equal((await call('DELETE', '/v1/me', { confirm: 'DELETE' })).statusCode, 204);

    for (const t of ['identity.users WHERE id', 'identity.consents WHERE user_id', 'phi.assessments WHERE user_id', 'phi.assessment_results WHERE user_id',
      'phi.rlp_goals WHERE user_id', 'keys.user_data_keys WHERE user_id']) {
      const n = (await db.system.query<{ n: number }>(`SELECT count(*)::int AS n FROM ${t} = $1`, [id])).rows[0].n;
      assert.equal(n, 0, t);
    }
    const trail = await db.system.query<{ action: string }>("SELECT action FROM audit.events WHERE actor_ref = $1 AND action = 'account.delete'", [id]);
    assert.equal(trail.rows.length, 1);
    assert.equal((await other.call('GET', '/v1/me')).json().eligible, true, 'other accounts untouched');
    // Signing in again with the same identity starts a new, empty account.
    assert.deepEqual((await call('GET', '/v1/me')).json(), { eligible: false, consents: [], firstName: null, aiExplanation: false });
  });
});

describe('per-user walls', () => {
  test("another user's assessment is invisible (404), not forbidden", async () => {
    const a = await readyUser();
    const b = await readyUser();
    const { id } = await draft(a, { age: '20-34', plan: 'no', everpreg: 'no' });
    for (const [m, url, body] of [
      ['GET', `/v1/assessments/${id}`],
      ['GET', `/v1/assessments/${id}/result`],
      ['PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'n1', optionId: 'n1.a' }] }],
      ['PUT', `/v1/assessments/${id}/profile`, profileIds({ age: '20-34', plan: 'no', everpreg: 'no' })],
      ['POST', `/v1/assessments/${id}/submit`],
      ['DELETE', `/v1/assessments/${id}`]
    ] as [string, string, unknown?][]) {
      assert.equal((await b.call(m, url, body)).statusCode, 404, `${m} ${url}`);
    }
    assert.equal((await b.call('GET', '/v1/assessments')).json().items.length, 0);
    assert.equal((await a.call('GET', `/v1/assessments/${id}`)).statusCode, 200);
  });

  test('row-level security blocks other users even without a WHERE clause', async () => {
    const a = await readyUser();
    await draft(a, { age: '20-34', plan: 'no', everpreg: 'no' });
    const total = (await db.system.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.assessments')).rows[0].n;
    const stranger = (await db.system.query<{ id: string }>(`INSERT INTO identity.users (idp_subject) VALUES ('dev-stranger') RETURNING id`)).rows[0].id;
    const seen = await db.asUser(stranger, tx => tx.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.assessments'));
    assert.ok(total > 0);
    assert.equal(seen.rows[0].n, 0);
    await assert.rejects(db.asUser(stranger, tx => tx.query('UPDATE identity.users SET status = $1', ['locked'])));
  });
});

describe('privacy in logs', () => {
  test('logs never contain answers, profile values, tokens or bodies', async () => {
    const u = await readyUser();
    const { id } = await draft(u, { age: '40+', plan: 'no', everpreg: 'no', country: 'CA' });
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'n17', optionId: 'n17.c' }] });
    await u.call('POST', `/v1/assessments/${id}/submit`);
    assert.ok(logs.length > 0, 'expected some logs');
    for (const forbidden of [/n17\.c/, /profile\.(age|plan|country)\./, /Bearer /, /eyJ[A-Za-z0-9_-]{10,}/, /"answers"/, /missingQuestionIds/, new RegExp(id)]) {
      assert.doesNotMatch(logs, forbidden);
    }
  });
});

describe('version 2.0 and Generate my plan', () => {
  test('a pinned 2.0 assessment scores, shows her vaccines, and drafts a plan without saving anything', async () => {
    const u = await readyUser();
    const created = (await u.call('POST', '/v1/assessments', { definitionId: 'rra-defs-2.0' }, { 'idempotency-key': randomUUID() })).json();
    assert.equal(created.scoringPolicyId, 'rra-2.0.0');
    assert.equal((await u.call('PUT', `/v1/assessments/${created.id}/profile`, { ...profileIds({ age: '20-34', plan: 'no', everpreg: 'no' }), relationship: 'profile.relationship.single' })).statusCode, 200);
    const picks: Record<string, string> = { n2: 'n2.b', n3: 'n3.c', n7: 'n7.b', n8: 'n8.c', n11: 'n11.b', n12: 'n12.c' };
    const ids = [...Array.from({ length: 18 }, (_, i) => `n${i + 1}`).filter(q => q !== 'n14' && q !== 'n4'), 'n1a', 'n1b'];
    const put = await u.call('PUT', `/v1/assessments/${created.id}/answers`, {
      answers: ids.map(q => ({ questionId: q, optionId: picks[q] ?? `${q}.a` })), followUps: { n7: ['vax_hpv', 'vax_flu'] }, numbers: { heightCm: 160, weightKg: 70 } });
    assert.equal(put.statusCode, 204, put.body);
    const r = await u.call('POST', `/v1/assessments/${created.id}/submit`);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json().notes, ['Your BMI is 27.3 (overweight). BMI is a simple estimate from your height and weight. A health worker can tell you what it means for you.', 'Vaccines to ask about: HPV, Influenza.']);
    assert.deepEqual(r.json().support, []);
    assert.deepEqual((await u.call('GET', `/v1/assessments/${created.id}`)).json().followUps, { n7: ['vax_hpv', 'vax_flu'] });

    const d = await u.call('GET', '/v1/rlp/draft');
    assert.equal(d.statusCode, 200, d.body);
    const plan = d.json();
    assert.equal(plan.intention, 'not_planning');
    assert.ok(plan.goals.length <= 5 && plan.questions.length <= 3);
    assert.ok(!JSON.stringify(plan).includes('my partner'));
    assert.equal(plan.goals.find((g: { title: string }) => g.title === 'Check my vaccination record').notes, 'To ask about: HPV, Influenza');
    assert.deepEqual((await u.call('GET', '/v1/rlp')).json().goals, []);
  });
});


describe('health details in Account', () => {
  test('saved from the assessment, editable, and checked', async () => {
    const u = await readyUser();
    assert.equal((await u.call('GET', '/v1/me/health-details')).json().bmi, null);
    const ok = await u.call('PUT', '/v1/me/health-details', { heightCm: 160, weightKg: 55, gravida: 3, parity: 2 });
    assert.equal(ok.statusCode, 200, ok.body);
    assert.deepEqual(ok.json().bmi, { value: 21.5, label: 'healthy' });
    assert.equal((await u.call('PUT', '/v1/me/health-details', { heightCm: 160, weightKg: null, gravida: null, parity: null })).statusCode, 422);
    assert.equal((await u.call('PUT', '/v1/me/health-details', { heightCm: null, weightKg: null, gravida: 1, parity: 2 })).statusCode, 422);
    assert.equal((await u.call('GET', '/v1/me/health-details')).json().gravida, 3);
  });
});

describe('Generate my plan on a retake', () => {
  test('the plan remembers which assessment it came from and which essentials apply', async () => {
    const u = await readyUser();
    const id = randomUUID();
    const r = await u.call('PATCH', '/v1/rlp', { sourceAssessmentId: id, essentialsFocus: ['vaccines'], setupComplete: true });
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual([r.json().sourceAssessmentId, r.json().essentialsFocus], [id, ['vaccines']]);
  });
});
