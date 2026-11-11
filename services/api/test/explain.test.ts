// AI-assisted explanation (ADR-018): every risk in the register has a test here. Synthetic users only; the AI is the
// local stand-in or a fake that misbehaves on purpose.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { loadConfig, type Config } from '../src/config.ts';
import { createKeyRing } from '../src/crypto.ts';
import type { Database } from '../src/db/database.ts';
import { loadRegistry } from '../src/registry.ts';
import { AI_RULES, aiExplanationAvailable, buildExplainInput, checkExplanation, standInExplainer, type ExplainInput, type Explainer } from '../src/explain.ts';
import { openTestDatabase } from './db.ts';

let logs = '';
let db: Database;
const config = loadConfig({ APP_ENV: 'test' });
const registry = loadRegistry();
const logStream = new Writable({ write(chunk, _e, cb) { logs += chunk.toString(); cb(); } });
const apps: Awaited<ReturnType<typeof buildApp>>[] = [];

async function appWith(explainer?: Explainer, overrides: Partial<Config> = {}) {
  const app = await buildApp({ config: { ...config, ...overrides }, db, auth: await createAuthenticator(config), registry, keyRing: createKeyRing(db, randomBytes(32)), logStream, explainer });
  apps.push(app);
  return app;
}

before(async () => {
  db = await openTestDatabase();
  await seedPolicyDocuments(db);
});
after(async () => { for (const a of apps) await a.close(); await db.close(); });

/** A synthetic member with a saved result; answers `b` lose points in several areas. */
async function member(app: Awaited<ReturnType<typeof buildApp>>, aiConsent = true) {
  const { accessToken } = (await app.inject({ method: 'POST', url: '/dev/token', payload: {} })).json();
  const call = (method: string, url: string, payload?: unknown, extra: Record<string, string> = {}) =>
    app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer ${accessToken}`, ...extra } });
  const docs = (await call('GET', '/v1/policies/current')).json().items as { id: string; kind: string }[];
  await call('POST', '/v1/me/eligibility', { confirmedAdult: true });
  const purposes: [string, string][] = [['health_processing', 'health_consent'], ['history_storage', 'privacy']];
  if (aiConsent) purposes.push(['ai_explanation', 'privacy']);
  for (const [purpose, kind] of purposes) {
    const r = await call('POST', '/v1/me/consents', { purpose, granted: true, policyDocumentId: docs.find(d => d.kind === kind)!.id, source: 'web' });
    assert.equal(r.statusCode, 201, r.body);
  }
  const { id } = (await call('POST', '/v1/assessments', { clientPlatform: 'web' }, { 'idempotency-key': randomUUID() })).json();
  await call('PUT', `/v1/assessments/${id}/profile`, { age: 'profile.age.20-34', country: 'profile.country.NG', cycle: 'profile.cycle.regular', everpreg: 'profile.everpreg.no', plan: 'profile.plan.no' });
  await call('PUT', `/v1/assessments/${id}/answers`, { answers: Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.b` })) });
  const submitted = await call('POST', `/v1/assessments/${id}/submit`);
  assert.equal(submitted.statusCode, 200, submitted.body);
  return { call, id, sha: submitted.json().resultSha256 as string };
}

test('with consent, a member gets a checked, labelled explanation, kept once with her result', async () => {
  let calls = 0;
  const counting: Explainer = { model: 'stand-in', explain: (r, i) => { calls++; return standInExplainer.explain(r, i); } };
  const app = await appWith(counting);
  const m = await member(app);
  assert.equal((await m.call('GET', '/v1/me')).json().aiExplanation, true);
  logs = '';
  const r = await m.call('POST', `/v1/assessments/${m.id}/explanation`);
  assert.equal(r.statusCode, 200, r.body);
  const e = r.json();
  assert.equal(e.label, 'AI-Explainer');
  assert.equal(e.rulesVersion, AI_RULES.version);
  assert.equal(e.areas.length, 3);
  assert.ok(e.summary.length > 0);
  // Once per result: asking again returns the same explanation without calling the AI.
  assert.equal((await m.call('POST', `/v1/assessments/${m.id}/explanation`)).json().createdAt, e.createdAt);
  assert.equal(calls, 1);
  assert.deepEqual((await m.call('GET', `/v1/assessments/${m.id}/explanation`)).json(), e);
  // R10: neither the explanation nor her answers are logged.
  assert.ok(!logs.includes(e.areas[0].explanation.slice(0, 40)));
  // Included in Download my data; removed with the result.
  assert.equal((await m.call('GET', '/v1/me/export')).json().assessments[0].aiExplanation.summary, e.summary);
  await m.call('DELETE', `/v1/assessments/${m.id}`);
  const left = (await db.system.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.assessment_explanations WHERE assessment_id = $1', [m.id])).rows[0].n;
  assert.equal(left, 0);
});

test('R9: without the ai_explanation consent nothing is sent to the AI', async () => {
  let calls = 0;
  const app = await appWith({ model: 'spy', explain: async () => { calls++; return ''; } });
  const m = await member(app, false);
  const r = await m.call('POST', `/v1/assessments/${m.id}/explanation`);
  assert.equal(r.statusCode, 412);
  assert.equal(calls, 0);
});

test('R1 and R6: the AI input holds no identifiers and no safety-flag questions', async () => {
  let seen = '';
  const app = await appWith({ model: 'spy', explain: async (rules, input) => { seen = JSON.stringify(input) + rules; return standInExplainer.explain(rules, input); } });
  const m = await member(app);
  assert.equal((await m.call('POST', `/v1/assessments/${m.id}/explanation`)).statusCode, 200);
  const user = (await db.system.query<{ user_id: string }>('SELECT user_id FROM phi.assessments WHERE id = $1', [m.id])).rows[0].user_id;
  for (const id of [user, m.id, m.sha]) assert.ok(!seen.includes(id));
  assert.doesNotMatch(seen, /\d{4}-\d{2}-\d{2}/, 'no dates');
  assert.doesNotMatch(seen, /@/, 'no email');

  // Safety questions are left out even when they are in a focus area and scored low.
  const { definition: def, policy } = registry.current;
  const safetyOptions = policy.safetyRules.flatMap(r => r.whenAnyOption);
  assert.ok(safetyOptions.length > 0);
  const answers = Object.fromEntries(safetyOptions.map(o => [o.split('.')[0], o]));
  const safetyTexts = def.sections.flatMap(s => s.questions).filter(q => q.id in answers).map(q => q.text);
  for (const pathway of ['pregnancy_planning', 'general_wellness'] as const) {
    const domains = policy.domains[pathway].map(d => ({ code: d.code, name: d.name, earned: 0, max: 1, percent: 0 }));
    const result = { definitionId: def.definitionId, policyId: policy.policyId, scoringStatus: policy.scoringStatus, pathway,
      overall: { earned: 0, max: 1, score: 10, band: 'low', bandLabel: 'Needs attention' }, domains, scoredItemCount: 1, safetyFlags: [] };
    const input = JSON.stringify(buildExplainInput(def, policy, result, 'NG', answers));
    for (const t of safetyTexts) assert.ok(!input.includes(t), `safety question sent: ${t}`);
  }
});

const sample: ExplainInput = {
  pathway: 'pregnancy_planning', country: 'NG', score: 62, band: 'Moderate', opening: 'Opening text.',
  focus: [
    { code: 'physical_medical', name: 'Physical health', level: 'attention', approvedGuidance: 'Take 400 micrograms of folic acid daily.', answers: [] },
    { code: 'substance_use', name: 'Substance use', level: 'priority', approvedGuidance: 'Guidance.', answers: [] },
    { code: 'family_planning', name: 'Family planning', level: 'strong', approvedGuidance: 'Guidance.', answers: [] }
  ]
};
const reply = (summary: string, explanation = 'Your answers suggest this area needs some care. Talk with your provider.') => JSON.stringify({
  summary, areas: sample.focus.map(f => ({ code: f.code, explanation, askYourProvider: ['What should I do first?'] }))
});

test('R2–R5: the checker accepts a careful reply and rejects unsafe ones', () => {
  assert.equal(checkExplanation(reply('Your score of 62 shows a good start. Folic acid, 400 micrograms a day, is part of the advice.'), sample).ok, true);
  const rejected: [string, string][] = [
    [reply('See https://example.org for more.'), 'link or contact'],
    [reply('Call 0803 123 4567 today.'), 'link or contact'],
    [reply('Most women, about 80 out of 100, do well.'), 'number not in the input'],
    [reply('Take 5 mg of folic acid.'), 'number not in the input'],
    [reply('You have a 30% lower chance.'), 'percentage'],
    [reply('You may have a condition that needs treatment.'), 'diagnosis'],
    [reply('You might be infertile.'), 'fertility claim'],
    [reply('Your answers mean you cannot get pregnant easily.'), 'pregnancy prediction'],
    [reply('Stop taking your medicine before trying.'), 'medicine advice'],
    [reply('As your doctor, I suggest a check-up.'), 'claims to be a clinician'],
    [reply('Dr Gloria recommends this for you.'), 'names a doctor'],
    [reply('If there is violence at home, seek help.'), 'safety topic'],
    [reply('This plan will guarantee success.'), 'promise'],
    [reply(Array(91).fill('word').join(' ')), 'summary length'],
    ['Here is your explanation.', 'not JSON'],
    [JSON.stringify({ summary: 'Fine.', areas: [] }), 'wrong areas']
  ];
  for (const [raw, reason] of rejected) assert.deepEqual(checkExplanation(raw, sample), { ok: false, reason }, raw);
});

test('R7: an unsafe or failing AI reply never reaches the member; her report is unaffected', async () => {
  let calls = 0;
  const app = await appWith({ model: 'bad', explain: async () => { calls++; return reply('You might be infertile.'); } });
  const m = await member(app);
  const r = await m.call('POST', `/v1/assessments/${m.id}/explanation`);
  assert.equal(r.statusCode, 503);
  assert.equal(calls, 2, 'one retry');
  assert.equal((await m.call('GET', `/v1/assessments/${m.id}/explanation`)).statusCode, 404);
  assert.equal((await m.call('GET', `/v1/assessments/${m.id}/result`)).statusCode, 200);
  const outcome = (await db.system.query<{ outcome: string }>(
    `SELECT outcome FROM audit.events WHERE action = 'assessment.ai_explain' AND resource_id = $1`, [m.id])).rows.map(r => r.outcome);
  assert.deepEqual(outcome, ['rejected']);

  const down = await appWith({ model: 'down', explain: async () => { throw new Error('provider down'); } });
  const d = await member(down);
  assert.equal((await d.call('POST', `/v1/assessments/${d.id}/explanation`)).statusCode, 503);
});

test('R11 and R12: the switch turns it off, and staging or production refuse unapproved rules', async () => {
  const off = await appWith(standInExplainer, { aiExplanations: false });
  const m = await member(off);
  assert.equal((await m.call('GET', '/v1/me')).json().aiExplanation, false);
  assert.equal((await m.call('POST', `/v1/assessments/${m.id}/explanation`)).statusCode, 503);
  assert.equal(aiExplanationAvailable({ ...config, env: 'staging', aiExplanations: true }, standInExplainer), AI_RULES.approved);
  assert.equal(aiExplanationAvailable({ ...config, env: 'production', aiExplanations: true }, standInExplainer), AI_RULES.approved);
  assert.equal(aiExplanationAvailable(config, undefined), false);
  assert.equal(loadConfig({ APP_ENV: 'test' }).aiExplanations, true);
});

test('another member cannot read or create an explanation for someone else\'s result', async () => {
  const app = await appWith(standInExplainer);
  const a = await member(app);
  await a.call('POST', `/v1/assessments/${a.id}/explanation`);
  const b = await member(app);
  assert.equal((await b.call('GET', `/v1/assessments/${a.id}/explanation`)).statusCode, 404);
  assert.equal((await b.call('POST', `/v1/assessments/${a.id}/explanation`)).statusCode, 404);
});

test('R6: the reply never raises safety at home, even gently', () => {
  const sample: ExplainInput = { pathway: 'general_wellness', country: 'NG', score: 80, band: 'High', opening: 'Opening.', focus: [
    { code: 'mental_health_safety', name: 'Mental health', level: 'strength', approvedGuidance: 'Keep your support close.', answers: [] }] };
  const reply = (text: string) => JSON.stringify({ summary: 'Your score is high.', areas: [{ code: 'mental_health_safety', explanation: text, askYourProvider: ['Who can I talk to?'] }] });
  for (const text of ['If you ever feel low or unsafe, talk to someone.', 'Seek help if mood, stress, or safety concerns grow.', 'Make sure you feel safe at home.']) {
    const r = checkExplanation(reply(text), sample);
    assert.equal(r.ok ? 'passed' : r.reason, 'safety topic', text);
  }
  assert.equal(checkExplanation(reply('Ask which birth control methods are safe for you.'), sample).ok, true, 'safe medicines and methods are fine');
});

test('no safe amount of alcohol (Dr Gloria, 5 Nov 2026)', () => {
  const sample: ExplainInput = { pathway: 'pregnancy_planning', country: 'NG', score: 70, band: 'Moderate', opening: 'Opening.', focus: [
    { code: 'sexual_substance', name: 'Sexual & Substance Health', level: 'attention', approvedGuidance: 'Alcohol can affect pregnancy.', answers: [] }] };
  const reply = (text: string) => JSON.stringify({ summary: 'Your score is moderate.', areas: [{ code: 'sexual_substance', explanation: text, askYourProvider: ['How can I stop drinking?'] }] });
  for (const text of ['Discussing safe drinking habits can help.', 'A provider can discuss testing, safe limits, and support.', 'Drink in moderation before pregnancy.'])
    assert.equal((r => r.ok ? 'passed' : r.reason)(checkExplanation(reply(text), sample)), 'alcohol advice', text);
  assert.equal(checkExplanation(reply('Stopping alcohol before pregnancy is best.'), sample).ok, true);
  assert.ok(AI_RULES.text.includes('Never suggest any amount'));
});

test('R13: the stand-in passes the checker for every pathway, area and level (synthetic evaluation set)', async () => {
  const { definition: def, policy } = registry.current;
  let cases = 0;
  for (const pathway of ['pregnancy_planning', 'general_wellness'] as const) {
    const all = policy.domains[pathway];
    for (let start = 0; start < all.length; start++) {
      for (const percent of [20, 60, 90]) {
        const domains = all.map((d, i) => ({ code: d.code, name: d.name, earned: 0, max: 1, percent: i >= start && i < start + 3 ? percent : 100 }));
        for (const band of ['high', 'moderate', 'low']) {
          const result = { definitionId: def.definitionId, policyId: policy.policyId, scoringStatus: policy.scoringStatus, pathway,
            overall: { earned: 0, max: 1, score: 50, band, bandLabel: band }, domains, scoredItemCount: 1, safetyFlags: [] };
          for (const country of ['NG', 'CA']) {
            const input = buildExplainInput(def, policy, result, country, {});
            const checked = checkExplanation(await standInExplainer.explain(AI_RULES.text, input), input);
            assert.ok(checked.ok, `${pathway} ${start} ${percent} ${band}: ${!checked.ok && checked.reason}`);
            cases++;
          }
        }
      }
    }
  }
  assert.ok(cases > 100);
});
