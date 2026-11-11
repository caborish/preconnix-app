// Reproductive Life Plan and dashboard, on an in-memory PGlite database with synthetic users only.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { createKeyRing, unseal } from '../src/crypto.ts';
import type { Database } from '../src/db/database.ts';
import { openTestDatabase } from './db.ts';
import { loadRegistry } from '../src/registry.ts';

let logs = '';
const logStream = new Writable({ write(chunk, _e, cb) { logs += chunk.toString(); cb(); } });
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;
const masterKey = randomBytes(32);

before(async () => {
  const config = loadConfig({ APP_ENV: 'test' });
  db = await openTestDatabase();
  await seedPolicyDocuments(db);
  app = await buildApp({ config, db, auth: await createAuthenticator(config), registry: loadRegistry(), keyRing: createKeyRing(db, masterKey), logStream });
});
after(async () => { await app.close(); await db.close(); });

async function user() {
  const { accessToken, subject } = (await app.inject({ method: 'POST', url: '/dev/token', payload: {} })).json();
  const call = (method: string, url: string, payload?: unknown, headers: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer ${accessToken}`, ...headers } });
  await call('GET', '/v1/me');
  const id = (await db.system.query<{ id: string }>('SELECT id FROM identity.users WHERE idp_subject = $1', [subject])).rows[0].id;
  return { call, id };
}

async function goal(u: Awaited<ReturnType<typeof user>>, title = 'Book a check-up', extra: Record<string, unknown> = {}) {
  const r = await u.call('POST', '/v1/rlp/goals', { category: 'checkups_screening', title, ...extra });
  assert.equal(r.statusCode, 201, r.body);
  return r.json();
}

describe('plan and goals', () => {
  test('a new plan is empty; intention and horizon can be set and partly changed', async () => {
    const u = await user();
    const empty = { intention: null, horizon: null, reviewDate: null, setupComplete: false, familyPicture: null, support: [], essentialsDone: [], providerQuestions: [], sourceAssessmentId: null, essentialsFocus: null };
    assert.deepEqual((await u.call('GET', '/v1/rlp')).json(), { ...empty, goals: [] });
    assert.deepEqual((await u.call('PATCH', '/v1/rlp', { intention: 'planning_later', horizon: '1_2y' })).json(), { ...empty, intention: 'planning_later', horizon: '1_2y' });
    assert.deepEqual((await u.call('PATCH', '/v1/rlp', { horizon: '3_5y' })).json(), { ...empty, intention: 'planning_later', horizon: '3_5y' });
  });

  test('the plan guide keeps her family picture, support, done essentials and provider questions (questions encrypted)', async () => {
    const u = await user();
    const p = (await u.call('PATCH', '/v1/rlp', {
      familyPicture: 'with_partner', support: ['partner', 'health_worker'], essentialsDone: ['genotype', 'vaccines'],
      providerQuestions: [' Should my partner and I check our genotypes? ', 'Synthetic question about folic acid']
    })).json();
    assert.deepEqual({ f: p.familyPicture, s: p.support, e: p.essentialsDone, q: p.providerQuestions }, {
      f: 'with_partner', s: ['partner', 'health_worker'], e: ['genotype', 'vaccines'],
      q: ['Should my partner and I check our genotypes?', 'Synthetic question about folic acid']
    });
    const kept = (await u.call('PATCH', '/v1/rlp', { intention: 'planning_now' })).json();
    assert.deepEqual({ f: kept.familyPicture, s: kept.support, q: kept.providerQuestions.length }, { f: 'with_partner', s: ['partner', 'health_worker'], q: 2 }, 'other changes leave them alone');
    const raw = (await db.system.query<{ q: Uint8Array }>('SELECT provider_questions_enc AS q FROM phi.rlp_plans WHERE user_id = $1', [u.id])).rows[0].q;
    assert.ok(!Buffer.from(raw).toString('utf8').includes('folic acid'), 'questions are encrypted at rest');
    assert.deepEqual((await u.call('PATCH', '/v1/rlp', { providerQuestions: [], support: [] })).json().providerQuestions, []);
    assert.equal((await u.call('PATCH', '/v1/rlp', { support: ['neighbour'] })).statusCode, 400, 'support is a fixed list');
    assert.equal((await u.call('PATCH', '/v1/rlp', { familyPicture: 'twins' })).statusCode, 400);
    assert.equal((await u.call('PATCH', '/v1/rlp', { providerQuestions: Array(11).fill('Q?') })).statusCode, 400, 'at most 10 questions');
  });

  test('set-up is recorded once, and a review date can be set, changed and cleared', async () => {
    const u = await user();
    const later = new Date(Date.now() + 90 * 86_400_000).toISOString().slice(0, 10);
    const p = (await u.call('PATCH', '/v1/rlp', { reviewDate: later, setupComplete: true })).json();
    assert.deepEqual({ r: p.reviewDate, s: p.setupComplete }, { r: later, s: true });
    const kept = (await u.call('PATCH', '/v1/rlp', { intention: 'unsure' })).json();
    assert.deepEqual({ r: kept.reviewDate, s: kept.setupComplete }, { r: later, s: true }, 'other changes leave both alone');
    assert.equal((await u.call('PATCH', '/v1/rlp', { reviewDate: null })).json().reviewDate, null);
    assert.equal((await u.call('PATCH', '/v1/rlp', { reviewDate: '2020-01-01' })).statusCode, 400, 'not in the past');
    assert.equal((await u.call('PATCH', '/v1/rlp', { setupComplete: false })).statusCode, 400, 'set-up cannot be undone');
  });

  test('goals and actions can be created, edited, completed and deleted', async () => {
    const u = await user();
    const g = await goal(u, 'Start folic acid', { notes: 'Ask pharmacist', targetDate: '2026-12-01', sourceDomain: 'physical_medical' });
    assert.deepEqual({ t: g.title, n: g.notes, d: g.targetDate, s: g.status, src: g.sourceDomain }, { t: 'Start folic acid', n: 'Ask pharmacist', d: '2026-12-01', s: 'open', src: 'physical_medical' });
    const a = (await u.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'Buy supplements', dueDate: '2026-11-01' })).json();
    assert.equal((await u.call('PATCH', `/v1/rlp/actions/${a.id}`, { done: true })).json().done, true);
    assert.equal((await u.call('PATCH', `/v1/rlp/actions/${a.id}`, { title: 'Buy folic acid' })).json().done, true, 'done stays when only the title changes');
    const edited = (await u.call('PATCH', `/v1/rlp/goals/${g.id}`, { notes: null, status: 'done' })).json();
    assert.deepEqual({ n: edited.notes, s: edited.status, actions: edited.actions.map((x: { title: string }) => x.title) }, { n: null, s: 'done', actions: ['Buy folic acid'] });
    assert.equal((await u.call('DELETE', `/v1/rlp/actions/${a.id}`)).statusCode, 204);
    assert.equal((await u.call('DELETE', `/v1/rlp/goals/${g.id}`)).statusCode, 204);
    assert.equal((await u.call('GET', '/v1/rlp')).json().goals.length, 0);
  });

  test('invalid input is rejected', async () => {
    const u = await user();
    for (const body of [
      { category: 'diagnosis', title: 'x' },
      { category: 'other', title: '' },
      { category: 'other', title: 'x'.repeat(121) },
      { category: 'other', title: 'x', targetDate: '31/12/2026' },
      { category: 'other', title: 'x', priority: 'high' }
    ]) assert.equal((await u.call('POST', '/v1/rlp/goals', body)).statusCode, 400, JSON.stringify(body));
    assert.equal((await u.call('PATCH', '/v1/rlp', { intention: 'maybe' })).statusCode, 400);
  });
});

describe('encryption', () => {
  test('goal, note and action text is stored encrypted, readable only with that user\'s key', async () => {
    const u = await user();
    const g = await goal(u, 'CANARY-GOAL-TITLE', { notes: 'CANARY-GOAL-NOTE' });
    await u.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'CANARY-ACTION' });
    const raw = await db.system.query<{ t: Uint8Array; n: Uint8Array }>('SELECT title_enc AS t, notes_enc AS n FROM phi.rlp_goals WHERE id = $1', [g.id]);
    const rawAction = await db.system.query<{ t: Uint8Array }>('SELECT title_enc AS t FROM phi.rlp_actions WHERE goal_id = $1', [g.id]);
    for (const blob of [raw.rows[0].t, raw.rows[0].n, rawAction.rows[0].t]) assert.doesNotMatch(Buffer.from(blob).toString('latin1'), /CANARY/);
    const other = await user();
    await goal(other); // creates the other user's key
    const otherKey = await createKeyRing(db, masterKey).dataKeyFor(other.id);
    assert.throws(() => unseal(otherKey, raw.rows[0].t));
  });

  test('deleting a user deletes their key (crypto-shredding)', async () => {
    const u = await user();
    await goal(u);
    assert.equal((await db.system.query('SELECT 1 FROM keys.user_data_keys WHERE user_id = $1', [u.id])).rows.length, 1);
    await db.system.query('DELETE FROM identity.users WHERE id = $1', [u.id]);
    assert.equal((await db.system.query('SELECT 1 FROM keys.user_data_keys WHERE user_id = $1', [u.id])).rows.length, 0);
    assert.equal((await db.system.query('SELECT 1 FROM phi.rlp_goals WHERE user_id = $1', [u.id])).rows.length, 0);
  });

  test('the app database role cannot read data keys', async () => {
    const u = await user();
    await goal(u);
    await assert.rejects(db.asUser(u.id, tx => tx.query('SELECT * FROM keys.user_data_keys')));
  });
});

describe('per-user walls', () => {
  test("another user's goals and actions are invisible (404)", async () => {
    const a = await user();
    const b = await user();
    const g = await goal(a);
    const act = (await a.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'Step' })).json();
    for (const [m, url, body] of [
      ['PATCH', `/v1/rlp/goals/${g.id}`, { title: 'hijack' }],
      ['DELETE', `/v1/rlp/goals/${g.id}`],
      ['POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'hijack' }],
      ['PATCH', `/v1/rlp/actions/${act.id}`, { done: true }],
      ['DELETE', `/v1/rlp/actions/${act.id}`]
    ] as [string, string, unknown?][]) assert.equal((await b.call(m, url, body)).statusCode, 404, `${m} ${url}`);
    assert.equal((await b.call('GET', '/v1/rlp')).json().goals.length, 0);
    assert.equal((await a.call('GET', '/v1/rlp')).json().goals[0].actions[0].done, false);
    const seen = await db.asUser(b.id, tx => tx.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.rlp_goals'));
    assert.equal(seen.rows[0].n, 0);
  });
});

describe('repeating goals and check-ins', () => {
  const today = () => new Date().toISOString().slice(0, 10);
  const daysAgo = (n: number) => new Date(Date.now() - n * 86_400_000).toISOString().slice(0, 10);

  test('a weekly goal with a target records one check-in per day, editable and removable', async () => {
    const u = await user();
    const g = await goal(u, 'Walk', { category: 'lifestyle', rhythm: 'weekly', target: { amount: 10, unit: 'km' } });
    assert.deepEqual({ r: g.rhythm, t: g.target, c: g.checkins }, { r: 'weekly', t: { amount: 10, unit: 'km' }, c: [] });
    assert.deepEqual((await u.call('PUT', `/v1/rlp/goals/${g.id}/checkins/${daysAgo(1)}`, { amount: 4.5 })).json(), { day: daysAgo(1), amount: 4.5 });
    assert.deepEqual((await u.call('PUT', `/v1/rlp/goals/${g.id}/checkins/${daysAgo(1)}`, { amount: 6 })).json(), { day: daysAgo(1), amount: 6 }, 'same day replaces');
    await u.call('PUT', `/v1/rlp/goals/${g.id}/checkins/${today()}`, {});
    const got = (await u.call('GET', '/v1/rlp')).json().goals[0];
    assert.deepEqual(got.checkins, [{ day: daysAgo(1), amount: 6 }, { day: today(), amount: null }]);
    assert.equal((await u.call('DELETE', `/v1/rlp/goals/${g.id}/checkins/${today()}`)).statusCode, 204);
    assert.equal((await u.call('GET', '/v1/rlp')).json().goals[0].checkins.length, 1);
  });

  test('rhythm and target can change; a one-off goal has no target and no check-ins', async () => {
    const u = await user();
    const g = await goal(u, 'Folic acid', { category: 'nutrition_supplements', rhythm: 'daily' });
    assert.equal((await u.call('PATCH', `/v1/rlp/goals/${g.id}`, { rhythm: 'weekly', target: { amount: 5, unit: 'days' } })).json().target.amount, 5);
    const once = (await u.call('PATCH', `/v1/rlp/goals/${g.id}`, { rhythm: 'once' })).json();
    assert.deepEqual({ r: once.rhythm, t: once.target }, { r: 'once', t: null }, 'target dropped with the rhythm');
    assert.equal((await u.call('PUT', `/v1/rlp/goals/${g.id}/checkins/${today()}`, {})).statusCode, 409);
    assert.equal((await u.call('POST', '/v1/rlp/goals', { category: 'other', title: 'x', rhythm: 'once', target: { amount: 1, unit: 'km' } })).statusCode, 400);
  });

  test('invalid check-ins are rejected', async () => {
    const u = await user();
    const g = await goal(u, 'Walk', { rhythm: 'weekly' });
    for (const [day, body] of [
      [daysAgo(200), {}], ['2026-13-01', {}], [today(), { amount: 0 }], [today(), { amount: -1 }], [today(), { amount: 'lots' }], [today(), { note: 'x' }]
    ] as [string, unknown][]) assert.equal((await u.call('PUT', `/v1/rlp/goals/${g.id}/checkins/${day}`, body)).statusCode, 400, JSON.stringify([day, body]));
    assert.equal((await u.call('POST', '/v1/rlp/goals', { category: 'other', title: 'x', rhythm: 'weekly', target: { amount: 1, unit: 'kg' } })).statusCode, 400);
  });

  test("another user's check-ins are invisible and cannot be written", async () => {
    const a = await user();
    const b = await user();
    const g = await goal(a, 'Walk', { rhythm: 'daily' });
    await a.call('PUT', `/v1/rlp/goals/${g.id}/checkins/${today()}`, {});
    assert.equal((await b.call('PUT', `/v1/rlp/goals/${g.id}/checkins/${today()}`, {})).statusCode, 404);
    assert.equal((await b.call('DELETE', `/v1/rlp/goals/${g.id}/checkins/${today()}`)).statusCode, 404);
    const seen = await db.asUser(b.id, tx => tx.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.rlp_checkins'));
    assert.equal(seen.rows[0].n, 0);
    assert.equal((await a.call('GET', '/v1/rlp')).json().goals[0].checkins.length, 1);
  });
});

describe('dashboard', () => {
  test('empty dashboard for a new user', async () => {
    const u = await user();
    assert.deepEqual((await u.call('GET', '/v1/dashboard')).json(), { firstName: null, intention: null, horizon: null, latestResult: null, goals: { open: 0, done: 0 }, nextActions: [] });
  });

  test('shows the latest saved result with three focus areas, and open actions by due date', async () => {
    const u = await user();
    const docs = (await app.inject({ method: 'GET', url: '/v1/policies/current' })).json().items as { id: string; kind: string }[];
    await u.call('POST', '/v1/me/eligibility', { confirmedAdult: true });
    for (const [purpose, kind] of [['health_processing', 'health_consent'], ['history_storage', 'privacy']]) {
      await u.call('POST', '/v1/me/consents', { purpose, granted: true, policyDocumentId: docs.find(d => d.kind === kind)!.id, source: 'ios' });
    }
    const { id } = (await u.call('POST', '/v1/assessments', {}, { 'idempotency-key': randomUUID() })).json();
    await u.call('PUT', `/v1/assessments/${id}/profile`, { age: 'profile.age.20-34', country: 'profile.country.CA', cycle: 'profile.cycle.regular', everpreg: 'profile.everpreg.no', plan: 'profile.plan.no' });
    const low = new Set(['n7', 'n8', 'n5']);
    await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: Array.from({ length: 18 }, (_, i) => `n${i + 1}`).map(q => ({ questionId: q, optionId: `${q}.${low.has(q) ? 'c' : 'a'}` })) });
    await u.call('POST', `/v1/assessments/${id}/submit`);

    const g = await goal(u, 'Vaccines');
    await u.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'Later step', dueDate: '2027-01-10' });
    await u.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'No date' });
    const soon = (await u.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'Soon step', dueDate: '2026-11-02' })).json();
    const done = (await u.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'Done step', dueDate: '2026-10-01' })).json();
    await u.call('PATCH', `/v1/rlp/actions/${done.id}`, { done: true });

    const d = (await u.call('GET', '/v1/dashboard')).json();
    assert.equal(d.latestResult.assessmentId, id);
    assert.equal(d.latestResult.country, 'CA');
    assert.deepEqual(d.latestResult.focus.map((f: { code: string }) => f.code), ['infectious_immunization', 'physical_nutrition', 'family_planning']);
    assert.deepEqual(d.nextActions.map((a: { title: string }) => a.title), ['Soon step', 'Later step', 'No date']);
    assert.equal(d.nextActions[0].id, soon.id);
    assert.equal(d.nextActions[0].goalTitle, 'Vaccines');
    assert.deepEqual(d.goals, { open: 1, done: 0 });
  });
});

describe('privacy in logs', () => {
  test('plan text never appears in logs', async () => {
    const u = await user();
    const g = await goal(u, 'CANARY-LOG-GOAL', { notes: 'CANARY-LOG-NOTE' });
    await u.call('POST', `/v1/rlp/goals/${g.id}/actions`, { title: 'CANARY-LOG-ACTION' });
    await u.call('GET', '/v1/rlp');
    await u.call('GET', '/v1/dashboard');
    assert.ok(logs.length > 0);
    assert.doesNotMatch(logs, /CANARY-LOG/);
  });
});

describe('Generate my plan', () => {
  async function assessed(u: Awaited<ReturnType<typeof user>>, picks: Record<string, string>, followUps?: Record<string, string[]>) {
    const created = (await u.call('POST', '/v1/assessments', { definitionId: 'rra-defs-2.0', clientPlatform: 'android' }, { 'idempotency-key': randomUUID() })).json();
    assert.equal(created.definitionId, 'rra-defs-2.0');
    const profile = { age: 'profile.age.20-34', country: 'profile.country.NG', cycle: 'profile.cycle.regular', everpreg: 'profile.everpreg.no', plan: 'profile.plan.no', relationship: 'profile.relationship.married' };
    assert.equal((await u.call('PUT', `/v1/assessments/${created.id}/profile`, profile)).statusCode, 200);
    const skip = picks.n2 === undefined || picks.n2 === 'n2.a';
    const ids = [...Array.from({ length: 18 }, (_, i) => `n${i + 1}`).filter(id => id !== 'n14' && !(id === 'n3' && skip)), 'n1a', 'n1b'];
    const answers = ids.map(q => ({ questionId: q, optionId: picks[q] ?? `${q}.a` }));
    const put = await u.call('PUT', `/v1/assessments/${created.id}/answers`, { answers, followUps });
    assert.equal(put.statusCode, 204, put.body);
    return { id: created.id, answers };
  }
  test('no assessment yet gives a clear answer', async () => {
    const u = await user();
    const r = await u.call('GET', '/v1/rlp/draft');
    assert.equal(r.statusCode, 404);
    assert.equal(r.json().code ?? r.json().type?.split('/').pop(), 'no_assessment');
  });

  test('an answer to a question that no longer applies is refused, and a closed vaccine list too', async () => {
    const u = await user();
    const { id } = await assessed(u, { n2: 'n2.a' });
    const bad = await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'n3', optionId: 'n3.a' }] });
    assert.equal(bad.statusCode, 422);
    const closed = await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [], followUps: { n7: ['vax_hpv'] } });
    assert.equal(closed.statusCode, 422);
  });

  test('changing n2 back removes the n3 answer and an older app can still use 1.1', async () => {
    const u = await user();
    const { id } = await assessed(u, { n2: 'n2.b', n3: 'n3.b' });
    assert.equal((await u.call('PUT', `/v1/assessments/${id}/answers`, { answers: [{ questionId: 'n2', optionId: 'n2.a' }] })).statusCode, 204);
    assert.equal((await u.call('GET', `/v1/assessments/${id}`)).json().answers.n3, undefined);
    const plain = (await u.call('POST', '/v1/assessments', {}, { 'idempotency-key': randomUUID() })).json();
    assert.equal(plain.definitionId, 'rra-defs-1.1');
  });

  test('a goal can repeat every month', async () => {
    const u = await user();
    const g = await goal(u, 'Talk to someone I trust', { rhythm: 'monthly', category: 'mental_wellbeing' });
    assert.equal(g.rhythm, 'monthly');
  });
});
