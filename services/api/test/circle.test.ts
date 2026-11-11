// Circle: weekly question, poll and moderated answers, on an in-memory PGlite database (synthetic users).
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { generateHandle, screenAnswer } from '../src/circle.ts';
import { loadConfig } from '../src/config.ts';
import { createKeyRing } from '../src/crypto.ts';
import type { Database } from '../src/db/database.ts';
import { openTestDatabase } from './db.ts';
import { loadRegistry } from '../src/registry.ts';

let logs = '';
const logStream = new Writable({ write(c, _e, cb) { logs += c.toString(); cb(); } });
let db: Database;
let app: Awaited<ReturnType<typeof buildApp>>;

before(async () => {
  const config = loadConfig({ APP_ENV: 'test' });
  db = await openTestDatabase();
  await seedPolicyDocuments(db);
  app = await buildApp({ config, db, auth: await createAuthenticator(config), registry: loadRegistry(), keyRing: createKeyRing(db, randomBytes(32)), logStream });
});
after(async () => { await app.close(); await db.close(); });

async function person(roles: string[] = []) {
  const { accessToken } = (await app.inject({ method: 'POST', url: '/dev/token', payload: roles.length ? { roles } : {} })).json();
  return (method: string, url: string, payload?: unknown) =>
    app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer ${accessToken}` } });
}

let mod: Awaited<ReturnType<typeof person>>;
let questionId: string;

describe('weekly question and poll', () => {
  test('only moderators can create questions', async () => {
    const member = await person();
    assert.equal((await member('POST', '/admin/v1/circle/questions', { prompt: 'Hijack?', publish: true })).statusCode, 403);
    assert.equal((await member('GET', '/admin/v1/circle/queue')).statusCode, 403);
    mod = await person(['moderator']);
    const r = await mod('POST', '/admin/v1/circle/questions', { prompt: 'What helps you rest?', pollOptions: ['Reading', 'Music', 'Walking'], publish: true });
    assert.equal(r.statusCode, 201, r.body);
    questionId = r.json().id;
  });

  test('every member gets a system-generated username', async () => {
    const a = await person();
    const h = (await a('GET', '/v1/circle/me')).json().handle as string;
    assert.match(h, /^[A-Za-z]{3,20}\d{2,4}$/);
    assert.equal((await a('GET', '/v1/circle/me')).json().handle, h, 'stable for the same person');
    for (let i = 0; i < 50; i++) assert.match(generateHandle(), /^[A-Z][a-z]+[A-Z][a-z]+\d{2,3}$/);
  });

  test('poll totals appear only after voting; one vote per person, changeable', async () => {
    const a = await person();
    const b = await person();
    const before = (await a('GET', '/v1/circle/current')).json();
    assert.equal(before.id, questionId);
    assert.deepEqual(before.poll, { options: ['Reading', 'Music', 'Walking'], myVote: null, totals: null });
    await a('POST', `/v1/circle/questions/${questionId}/vote`, { option: 1 });
    await a('POST', `/v1/circle/questions/${questionId}/vote`, { option: 2 });
    const after = (await b('POST', `/v1/circle/questions/${questionId}/vote`, { option: 2 })).json();
    assert.deepEqual(after.poll.totals, [0, 0, 2]);
    assert.equal(after.poll.myVote, 2);
    assert.equal((await a('POST', `/v1/circle/questions/${questionId}/vote`, { option: 4 })).statusCode, 422);
  });
});

describe('moderated answers', () => {
  test('answers stay hidden from others until a moderator approves them', async () => {
    const author = await person();
    const reader = await person();
    const r = await author('POST', `/v1/circle/questions/${questionId}/answers`, { body: 'A warm bath helps me unwind.' });
    assert.equal(r.statusCode, 201);
    assert.equal(r.json().status, 'pending');
    const id = r.json().id;
    const mine = (await author('GET', '/v1/circle/current')).json().answers.find((x: { id: string }) => x.id === id);
    assert.deepEqual([mine.status, mine.mine], ['pending', true]);
    assert.equal((await reader('GET', '/v1/circle/current')).json().answers.some((x: { id: string }) => x.id === id), false);
    const raw = await db.system.query<{ user_id: string }>('SELECT user_id FROM phi.circle_answers WHERE id = $1', [id]);
    const seen = await db.asUser((await db.system.query<{ id: string }>('SELECT id FROM identity.users WHERE id <> $1 LIMIT 1', [raw.rows[0].user_id])).rows[0].id,
      tx => tx.query(`SELECT 1 FROM phi.circle_answers WHERE id = $1`, [id]));
    assert.equal(seen.rows.length, 0, 'row-level security hides pending answers from other members');

    const queue = (await mod('GET', '/admin/v1/circle/queue')).json();
    assert.ok(queue.pending.some((x: { id: string }) => x.id === id));
    assert.equal((await mod('POST', `/admin/v1/circle/answers/${id}/decision`, { decision: 'approve' })).statusCode, 204);
    const shown = (await reader('GET', '/v1/circle/current')).json().answers.find((x: { id: string }) => x.id === id);
    assert.deepEqual([shown.status, shown.mine, typeof shown.handle], ['approved', false, 'string']);
    assert.equal('userId' in shown, false, 'no account ids are exposed');
  });

  test('rejected answers never appear, not even to their author', async () => {
    const author = await person();
    const id = (await author('POST', `/v1/circle/questions/${questionId}/answers`, { body: 'Something off-topic.' })).json().id;
    await mod('POST', `/admin/v1/circle/answers/${id}/decision`, { decision: 'reject' });
    assert.equal((await author('GET', '/v1/circle/current')).json().answers.some((x: { id: string }) => x.id === id), false);
  });

  test('links, emails and phone numbers are refused', () => {
    for (const body of ['see www.example.com', 'visit https://x.ng', 'mail me a@b.co', 'call +234 803 123 4567', 'text 0803-123-4567'])
      assert.deepEqual(screenAnswer(body), { ok: false, reason: 'contact_details' }, body);
    assert.deepEqual(screenAnswer('I walk 30 minutes a day, 5 days a week.'), { ok: true, needsAttention: false });
  });

  test('safety words are flagged for moderators first, and the author is shown support', async () => {
    const author = await person();
    const r = (await author('POST', `/v1/circle/questions/${questionId}/answers`, { body: 'I feel unsafe at home lately.' })).json();
    assert.equal(r.showSupport, true);
    const first = (await mod('GET', '/admin/v1/circle/queue')).json().pending[0];
    assert.equal(first.id, r.id);
    assert.equal(first.needsAttention, true);
  });

  test('members can have at most 3 answers waiting at once', async () => {
    const author = await person();
    for (let i = 0; i < 3; i++) assert.equal((await author('POST', `/v1/circle/questions/${questionId}/answers`, { body: `Answer ${i}` })).statusCode, 201);
    assert.equal((await author('POST', `/v1/circle/questions/${questionId}/answers`, { body: 'One more' })).statusCode, 429);
  });
});

describe('report and block', () => {
  test('approved answers can be reported; reports reach the moderator', async () => {
    const author = await person();
    const reader = await person();
    const id = (await author('POST', `/v1/circle/questions/${questionId}/answers`, { body: 'Rude remark here.' })).json().id;
    await mod('POST', `/admin/v1/circle/answers/${id}/decision`, { decision: 'approve' });
    assert.equal((await reader('POST', `/v1/circle/answers/${id}/report`, { reason: 'offensive' })).statusCode, 204);
    const reported = (await mod('GET', '/admin/v1/circle/queue')).json().reported.find((x: { id: string }) => x.id === id);
    assert.deepEqual([reported.reports, reported.reasons], [1, ['offensive']]);
  });

  test('blocking a username hides their answers for that member only', async () => {
    const author = await person();
    const blocker = await person();
    const other = await person();
    const handle = (await author('GET', '/v1/circle/me')).json().handle;
    const id = (await author('POST', `/v1/circle/questions/${questionId}/answers`, { body: 'Visible answer.' })).json().id;
    await mod('POST', `/admin/v1/circle/answers/${id}/decision`, { decision: 'approve' });
    assert.equal((await blocker('POST', '/v1/circle/blocks', { handle })).statusCode, 204);
    assert.equal((await blocker('GET', '/v1/circle/current')).json().answers.some((x: { id: string }) => x.id === id), false);
    assert.equal((await other('GET', '/v1/circle/current')).json().answers.some((x: { id: string }) => x.id === id), true);
    await blocker('DELETE', `/v1/circle/blocks/${handle}`);
    assert.equal((await blocker('GET', '/v1/circle/current')).json().answers.some((x: { id: string }) => x.id === id), true);
  });
});

describe('moderator response and archive', () => {
  test('the moderator response shows on the question; publishing a new question closes the old one', async () => {
    const member = await person();
    await mod('PATCH', `/admin/v1/circle/questions/${questionId}`, { response: 'Rest looks different for everyone.', responseReviewedBy: 'Clinical lead' });
    assert.equal((await member('GET', '/v1/circle/current')).json().response, 'Rest looks different for everyone.');
    const next = (await mod('POST', '/admin/v1/circle/questions', { prompt: 'What is your favourite healthy meal?', publish: true })).json().id;
    assert.equal((await member('GET', '/v1/circle/current')).json().id, next);
    const past = (await member('GET', `/v1/circle/questions/${questionId}`)).json();
    assert.equal(past.status, 'closed');
    assert.ok(past.poll.totals, 'closed polls show totals to everyone');
    assert.equal((await member('POST', `/v1/circle/questions/${questionId}/answers`, { body: 'Late answer' })).statusCode, 409);
    const archive = (await member('GET', '/v1/circle/questions')).json().items.map((q: { id: string }) => q.id);
    assert.deepEqual(archive.slice(0, 2), [next, questionId]);
  });

  test('draft questions are invisible to members', async () => {
    const member = await person();
    const draft = (await mod('POST', '/admin/v1/circle/questions', { prompt: 'Draft question, not live' })).json().id;
    assert.equal((await member('GET', `/v1/circle/questions/${draft}`)).statusCode, 404);
  });

  test('answer text never appears in logs', async () => {
    const author = await person();
    await author('POST', `/v1/circle/questions/${(await author('GET', '/v1/circle/current')).json().id}/answers`, { body: 'CANARY-CIRCLE-TEXT' });
    assert.doesNotMatch(logs, /CANARY-CIRCLE/);
  });
});
