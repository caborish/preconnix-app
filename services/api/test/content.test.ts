// Admin console content: staff roles, lesson approval by a clinical reviewer, settings, CORS. Synthetic staff only.
import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { seedContent } from '../src/content.ts';
import { LESSONS } from '@preconnix/content';

// The workflow tests start from drafts, as a new lesson would.
const DRAFTS = LESSONS.map(l => ({ ...l, status: 'draft' as const, reviewedBy: undefined, reviewedOn: undefined }));
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
  await seedContent(db, DRAFTS);
  app = await buildApp({ config, db, auth: await createAuthenticator(config), registry: loadRegistry(), keyRing: createKeyRing(db, randomBytes(32)), logStream });
});
after(async () => { await app.close(); await db.close(); });

async function person(roles: string[] = []) {
  const { accessToken } = (await app.inject({ method: 'POST', url: '/dev/token', payload: roles.length ? { roles } : {} })).json();
  return (method: string, url: string, payload?: unknown) =>
    app.inject({ method: method as 'GET', url, payload: payload as object, headers: { authorization: `Bearer ${accessToken}` } });
}

const ID = 'knowing-your-menstrual-cycle';
type Item = Record<string, unknown> & { id: string; options: { label: unknown; explanation: unknown; best?: boolean }[]; takeaway: string };
const bodyOf = ({ id: _i, status: _s, reviewedBy: _r, reviewedOn: _o, position: _p, live: _l, changedSinceApproval: _c, editedByMe: _e, updatedAt: _u, reviewNote: _n, ...b }: Item) => b;
const withTakeaway = (l: Item, takeaway: string) => ({ ...bodyOf(l), takeaway });

describe('staff roles', () => {
  test('members are refused on every admin endpoint', async () => {
    const member = await person();
    for (const [m, u] of [['GET', '/admin/v1/me'], ['GET', '/admin/v1/lessons'], ['GET', '/admin/v1/settings'], ['GET', '/admin/v1/circle/queue']]) {
      assert.equal((await member(m, u)).statusCode, 403, `${m} ${u}`);
    }
  });

  test('each role sees only its own tools', async () => {
    const mod = await person(['moderator']);
    assert.deepEqual((await mod('GET', '/admin/v1/me')).json(), { roles: ['moderator'] });
    assert.equal((await mod('GET', '/admin/v1/lessons')).statusCode, 403);
    const editor = await person(['content_editor']);
    assert.equal((await editor('GET', '/admin/v1/circle/queue')).statusCode, 403);
    assert.equal((await editor('GET', '/admin/v1/lessons')).statusCode, 200);
  });

  test('unknown roles in a token are ignored', async () => {
    const r = await app.inject({ method: 'POST', url: '/dev/token', payload: { roles: ['admin'] } });
    assert.equal(r.statusCode, 400);
  });
});

describe('lessons: editors draft, clinical reviewers approve', () => {
  test('members see no lessons until one is approved; test builds can preview drafts', async () => {
    const pub = (await app.inject({ method: 'GET', url: '/v1/content' })).json();
    assert.equal(pub.lessons.length, 0);
    assert.equal(pub.settings.consultationUrl, 'https://preconnix.com/reproductive-life-plan/');
    const preview = (await app.inject({ method: 'GET', url: '/v1/content?preview=drafts' })).json();
    assert.equal(preview.lessons.length, 10);
    assert.ok(preview.lessons.every((l: { status: string }) => l.status === 'draft'));
  });

  test('reviewers cannot edit; editors cannot approve', async () => {
    const editor = await person(['content_editor']);
    const reviewer = await person(['clinical_reviewer']);
    const lesson = (await editor('GET', '/admin/v1/lessons')).json().items.find((l: Item) => l.id === ID);
    assert.equal((await reviewer('PUT', `/admin/v1/lessons/${ID}`, bodyOf(lesson))).statusCode, 403);
    assert.equal((await editor('POST', `/admin/v1/lessons/${ID}/review`, { decision: 'approve', reviewerName: 'Dr Test' })).statusCode, 403);
  });

  test('an incomplete lesson cannot go to review; approval publishes it', async () => {
    const editor = await person(['content_editor']);
    const reviewer = await person(['clinical_reviewer']);
    const lesson = (await editor('GET', '/admin/v1/lessons')).json().items.find((l: Item) => l.id === ID);
    const noBest = { ...bodyOf(lesson), options: lesson.options.map((o: Item['options'][number]) => ({ label: o.label, explanation: o.explanation })) };
    assert.equal((await editor('PUT', `/admin/v1/lessons/${ID}`, noBest)).statusCode, 204);
    const refused = await editor('POST', `/admin/v1/lessons/${ID}/submit`);
    assert.equal(refused.statusCode, 422);
    assert.match(refused.json().title, /strongest/);

    assert.equal((await editor('PUT', `/admin/v1/lessons/${ID}`, withTakeaway(lesson, 'Synthetic test takeaway.'))).statusCode, 204);
    assert.equal((await editor('POST', `/admin/v1/lessons/${ID}/submit`)).statusCode, 204);

    const returned = await reviewer('POST', `/admin/v1/lessons/${ID}/review`, { decision: 'return', note: 'Shorten card 2' });
    assert.equal(returned.statusCode, 204);
    const back = (await editor('GET', '/admin/v1/lessons')).json().items.find((l: Item) => l.id === ID);
    assert.equal(back.status, 'draft');
    assert.equal(back.reviewNote, 'Shorten card 2');

    assert.equal((await editor('POST', `/admin/v1/lessons/${ID}/submit`)).statusCode, 204);
    assert.equal((await reviewer('POST', `/admin/v1/lessons/${ID}/review`, { decision: 'approve' })).statusCode, 422, 'reviewer name required');
    assert.equal((await reviewer('POST', `/admin/v1/lessons/${ID}/review`, { decision: 'approve', reviewerName: 'Dr Synthetic Reviewer' })).statusCode, 204);

    const pub = (await app.inject({ method: 'GET', url: '/v1/content' })).json();
    assert.equal(pub.lessons.length, 1);
    assert.equal(pub.lessons[0].id, ID);
    assert.equal(pub.lessons[0].reviewedBy, 'Dr Synthetic Reviewer');
    assert.match(pub.lessons[0].reviewedOn, /^\d{4}-\d{2}-\d{2}$/);
    assert.equal(pub.lessons[0].takeaway, 'Synthetic test takeaway.');
    assert.equal(pub.lessons[0].story.CA.length, 5);
  });

  test('editing an approved lesson leaves the approved copy live until re-approved', async () => {
    const editor = await person(['content_editor']);
    const lesson = (await editor('GET', '/admin/v1/lessons')).json().items.find((l: Item) => l.id === ID);
    assert.equal((await editor('PUT', `/admin/v1/lessons/${ID}`, withTakeaway(lesson, 'Changed but not approved.'))).statusCode, 204);
    const after = (await editor('GET', '/admin/v1/lessons')).json().items.find((l: Item) => l.id === ID);
    assert.equal(after.status, 'draft');
    assert.equal(after.live, true);
    assert.equal(after.changedSinceApproval, true);
    const pub = (await app.inject({ method: 'GET', url: '/v1/content' })).json();
    assert.equal(pub.lessons[0].takeaway, 'Synthetic test takeaway.');
  });

  test('a reviewer who is also an editor cannot approve their own edit', async () => {
    const both = await person(['content_editor', 'clinical_reviewer']);
    const lesson = (await both('GET', '/admin/v1/lessons')).json().items.find((l: Item) => l.id === ID);
    assert.equal((await both('PUT', `/admin/v1/lessons/${ID}`, bodyOf(lesson))).statusCode, 204);
    assert.equal((await both('POST', `/admin/v1/lessons/${ID}/submit`)).statusCode, 204);
    const r = await both('POST', `/admin/v1/lessons/${ID}/review`, { decision: 'approve', reviewerName: 'Dr Self' });
    assert.equal(r.statusCode, 403);
    assert.equal(r.json().code, 'own_edit');
  });

  test('new lessons start as drafts, ids are unique, and bad links are refused', async () => {
    const editor = await person(['content_editor']);
    const lesson = (await editor('GET', '/admin/v1/lessons')).json().items.find((l: Item) => l.id === ID);
    const body = { id: 'synthetic-new-lesson', ...bodyOf(lesson) };
    assert.equal((await editor('POST', '/admin/v1/lessons', body)).statusCode, 201);
    assert.equal((await editor('POST', '/admin/v1/lessons', body)).statusCode, 409);
    const pub = (await app.inject({ method: 'GET', url: '/v1/content' })).json();
    assert.ok(!pub.lessons.some((l: { id: string }) => l.id === 'synthetic-new-lesson'));
    const badLink = { ...bodyOf(lesson), resources: { ...(lesson.resources as object), other: [{ label: 'x', url: 'http://insecure.example' }] } };
    assert.equal((await editor('PUT', `/admin/v1/lessons/${ID}`, badLink)).statusCode, 400);
  });

  test('with no editors yet, a clinical reviewer can approve a draft directly', async () => {
    const reviewer = await person(['clinical_reviewer']);
    const r = await reviewer('POST', '/admin/v1/lessons/what-is-preconception-health/review', { decision: 'approve', reviewerName: 'Dr Synthetic Reviewer' });
    assert.equal(r.statusCode, 204, r.body);
    const pub = (await app.inject({ method: 'GET', url: '/v1/content' })).json();
    assert.ok(pub.lessons.some((l: { id: string }) => l.id === 'what-is-preconception-health'));
    assert.equal((await reviewer('POST', '/admin/v1/lessons/what-is-preconception-health/review', { decision: 'approve', reviewerName: 'Dr Synthetic Reviewer' })).statusCode, 409);
  });

  test('seeding again adds nothing and never overwrites', async () => {
    const before = (await db.system.query<{ n: number }>('SELECT count(*)::int AS n FROM content.lessons')).rows[0].n;
    await seedContent(db, DRAFTS);
    assert.equal((await db.system.query<{ n: number }>('SELECT count(*)::int AS n FROM content.lessons')).rows[0].n, before);
  });

  test('an approval in the code approves only lessons whose text is unchanged, and is audited', async () => {
    const [edited, untouched] = [LESSONS[8].id, LESSONS[9].id];
    await db.system.query(`UPDATE content.lessons SET working = working || '{"title":"Edited in the console"}'::jsonb WHERE id = $1`, [edited]);
    await seedContent(db);
    const status = async (id: string) => (await db.system.query<{ status: string; reviewed_by: string }>('SELECT status, reviewed_by FROM content.lessons WHERE id = $1', [id])).rows[0];
    assert.deepEqual(await status(untouched), { status: 'approved', reviewed_by: 'Dr Gloria Williams-Aborishade' });
    assert.notEqual((await status(edited)).status, 'approved');
    const audits = (await db.system.query<{ n: number }>(`SELECT count(*)::int AS n FROM audit.events WHERE action = 'content.lesson.approve' AND actor_ref = 'content-seed' AND resource_id = $1`, [untouched])).rows[0].n;
    assert.equal(audits, 1);
  });
});

describe('settings', () => {
  test('editors change the booking link and reminder suggestions; bad values are refused', async () => {
    const editor = await person(['content_editor']);
    const mod = await person(['moderator']);
    const good = { consultationUrl: 'https://example.com/book', consultationCountries: ['ng'], reminderSuggestions: ['Drink water', '  '] };
    assert.equal((await mod('PUT', '/admin/v1/settings', good)).statusCode, 403);
    const r = await editor('PUT', '/admin/v1/settings', good);
    assert.equal(r.statusCode, 200, r.body);
    assert.deepEqual(r.json(), { consultationUrl: 'https://example.com/book', consultationCountries: ['NG'], reminderSuggestions: ['Drink water'] });
    assert.equal((await app.inject({ method: 'GET', url: '/v1/content' })).json().settings.consultationUrl, 'https://example.com/book');
    assert.equal((await editor('PUT', '/admin/v1/settings', { ...good, consultationUrl: 'http://insecure.example.com' })).statusCode, 422);
  });
});

describe('admin console plumbing', () => {
  test('CORS is allowed only for the admin console origin', async () => {
    const ok = await app.inject({ method: 'OPTIONS', url: '/admin/v1/lessons', headers: { origin: 'http://localhost:8083', 'access-control-request-method': 'GET' } });
    assert.equal(ok.statusCode, 204);
    assert.equal(ok.headers['access-control-allow-origin'], 'http://localhost:8083');
    const other = await app.inject({ method: 'GET', url: '/v1/content', headers: { origin: 'https://evil.example' } });
    assert.equal(other.headers['access-control-allow-origin'], undefined);
  });

  test('every admin write is audited as an admin action, without content', async () => {
    // Approvals carried in the code are audited as the system ('content-seed'); everything else is a staff action.
    const rows = (await db.system.query<{ action: string; actor_type: string; outcome: string }>(
      `SELECT action, actor_type, outcome FROM audit.events WHERE action LIKE 'content.%' AND actor_type <> 'system'`)).rows;
    const actions = new Set(rows.map(r => r.action));
    for (const a of ['content.lesson.update', 'content.lesson.submit', 'content.lesson.return', 'content.lesson.approve', 'content.lesson.create', 'content.settings.update']) {
      assert.ok(actions.has(a), a);
    }
    assert.ok(rows.every(r => r.actor_type === 'admin'));
    assert.ok(rows.some(r => r.action === 'content.lesson.approve' && r.outcome === 'denied'), 'self-approval attempt recorded');
    assert.ok(!logs.includes('Synthetic test takeaway'), 'lesson text never logged');
  });
});
