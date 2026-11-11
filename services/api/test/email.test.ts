// Report emails (BE-18): only the member's own saved result, only to their own sign-in address, never logged.
// A fake mailer records messages instead of sending them. Synthetic users and @example.com addresses only.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomBytes, randomUUID } from 'node:crypto';
import { Writable } from 'node:stream';
import { buildApp, seedPolicyDocuments } from '../src/app.ts';
import { createAuthenticator } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';
import { createKeyRing } from '../src/crypto.ts';
import type { Database } from '../src/db/database.ts';
import { letterEmail, type MailMessage } from '../src/mail.ts';
import { loadRegistry } from '../src/registry.ts';
import { openTestDatabase } from './db.ts';

let logs = '';
const sent: MailMessage[] = [];
let db: Database;
let auth: Awaited<ReturnType<typeof createAuthenticator>>;
let app: Awaited<ReturnType<typeof buildApp>>;
let noMail: Awaited<ReturnType<typeof buildApp>>;
let withPdf: Awaited<ReturnType<typeof buildApp>>;
const rendered: string[] = [];

before(async () => {
  const config = loadConfig({ APP_ENV: 'test' });
  db = await openTestDatabase();
  await seedPolicyDocuments(db);
  auth = await createAuthenticator(config);
  const keyRing = createKeyRing(db, randomBytes(32));
  const logStream = new Writable({ write(chunk, _e, cb) { logs += chunk.toString(); cb(); } });
  app = await buildApp({ config, db, auth, registry: loadRegistry(), keyRing, logStream, mailer: { send: async m => { sent.push(m); } } });
  noMail = await buildApp({ config, db, auth, registry: loadRegistry(), keyRing, logStream });
  withPdf = await buildApp({ config, db, auth, registry: loadRegistry(), keyRing, logStream,
    mailer: { send: async m => { sent.push(m); } }, pdf: { render: async html => { rendered.push(html); return Buffer.from('%PDF-1.7 fake'); } } });
});
after(async () => { await app.close(); await noMail.close(); await withPdf.close(); await db.close(); });

/** Waits for background work (the welcome letter) to finish. */
const settled = (on: typeof app) => (on as unknown as { settled: () => Promise<void> }).settled();

const allTop = Array.from({ length: 18 }, (_, i) => ({ questionId: `n${i + 1}`, optionId: `n${i + 1}.a` }));

/** A member with a saved result. */
async function member(email?: string, firstName?: string, submitOn = app) {
  const { accessToken } = (await app.inject({ method: 'POST', url: '/dev/token', payload: { ...(email ? { email } : {}), ...(firstName ? { firstName } : {}) } })).json();
  const h = { authorization: `Bearer ${accessToken}` };
  const call = (method: string, url: string, payload?: unknown, extra: Record<string, string> = {}, on = app) =>
    on.inject({ method: method as 'GET', url, payload: payload as object, headers: { ...h, ...extra } });
  const docs = (await call('GET', '/v1/policies/current')).json().items as { id: string; kind: string }[];
  await call('POST', '/v1/me/eligibility', { confirmedAdult: true });
  for (const [purpose, kind] of [['health_processing', 'health_consent'], ['history_storage', 'privacy']]) {
    await call('POST', '/v1/me/consents', { purpose, granted: true, policyDocumentId: docs.find(d => d.kind === kind)!.id, source: 'web' });
  }
  const { id } = (await call('POST', '/v1/assessments', { clientPlatform: 'web' }, { 'idempotency-key': randomUUID() })).json();
  await call('PUT', `/v1/assessments/${id}/profile`, { age: 'profile.age.20-34', country: 'profile.country.NG', cycle: 'profile.cycle.regular', everpreg: 'profile.everpreg.no', plan: 'profile.plan.no' });
  await call('PUT', `/v1/assessments/${id}/answers`, { answers: allTop });
  assert.equal((await call('POST', `/v1/assessments/${id}/submit`, undefined, {}, submitOn)).json().saved, true);
  await settled(submitOn);
  return { call, id };
}

test('a member gets their own detailed report at their sign-in address, and nothing of it is logged', async () => {
  const m = await member('ada.test@example.com');
  logs = '';
  const r = await m.call('POST', `/v1/assessments/${m.id}/email`);
  assert.equal(r.statusCode, 202, r.body);
  const msg = sent.at(-1)!;
  assert.equal(msg.to, 'ada.test@example.com');
  assert.match(msg.html, /100<span/);
  assert.match(msg.text, /Family Planning & Contraception: 100% \(Strong\)/);
  assert.match(msg.text, /forward this email to your doctor/);
  assert.doesNotMatch(logs, /ada\.test|example\.com|Family Planning/);
  const trail = await db.system.query<{ n: number }>("SELECT count(*)::int AS n FROM audit.events WHERE action = 'assessment.report_email' AND outcome = 'success'");
  assert.ok(trail.rows[0].n >= 1);
});

test("another member's result cannot be emailed (404), and a sign-in without email is refused", async () => {
  const owner = await member('owner@example.com');
  const other = await member('other@example.com');
  assert.equal((await other.call('POST', `/v1/assessments/${owner.id}/email`)).statusCode, 404);
  const noAddress = await member();
  assert.equal((await noAddress.call('POST', `/v1/assessments/${noAddress.id}/email`)).statusCode, 409);
});

test('five emails a day per member, and 503 when email is not set up', async () => {
  const m = await member('five@example.com');
  for (let i = 0; i < 5; i++) assert.equal((await m.call('POST', `/v1/assessments/${m.id}/email`)).statusCode, 202);
  assert.equal((await m.call('POST', `/v1/assessments/${m.id}/email`)).statusCode, 429);
  assert.equal((await m.call('POST', `/v1/assessments/${m.id}/email`, undefined, {}, noMail)).statusCode, 503);
});

test('the test sign-in only accepts synthetic @example.com addresses', async () => {
  assert.equal((await app.inject({ method: 'POST', url: '/dev/token', payload: { email: 'someone@gmail.com' } })).statusCode, 400);
});

test("the report comes in the app's PDF design, only for the member's own saved result", async () => {
  const m = await member('pdf@example.com');
  const r = await m.call('GET', `/v1/assessments/${m.id}/report`);
  assert.equal(r.statusCode, 200);
  const { html, fileName } = r.json();
  assert.match(fileName, /^PreConnix_Reproductive_Health_Score_\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.match(html, /100 out of 100/);
  assert.match(html, /<!doctype html>|<html/i);
  const other = await member('pdf-other@example.com');
  assert.equal((await other.call('GET', `/v1/assessments/${m.id}/report`)).statusCode, 404);
});

test("the first assessment sends Dr Gloria's welcome letter by itself, with the PDF and the app link", async () => {
  const before = sent.length;
  logs = '';
  const m = await member('welcome@example.com', undefined, withPdf);
  assert.equal(sent.length, before + 1, 'one letter, sent without being asked');
  const first = sent.at(-1)!;
  assert.equal(first.to, 'welcome@example.com');
  assert.equal(first.subject, 'Welcome to PreConnix: your Reproductive Health Score');
  assert.match(first.text, /Dr Gloria Williams-Aborishade/);
  assert.match(first.text, /also your sign-in for the PreConnix app/);
  assert.match(first.html, /https:\/\/preconnix\.com\/app\//);
  assert.equal(first.attachments?.length, 1);
  assert.match(first.attachments![0].name, /^PreConnix_Reproductive_Health_Score_\d{4}-\d{2}-\d{2}\.pdf$/);
  assert.equal(Buffer.from(first.attachments![0].contentInBase64, 'base64').toString(), '%PDF-1.7 fake');
  assert.match(rendered.at(-1)!, /100 out of 100/, "the PDF is printed from the app's report design");
  assert.doesNotMatch(first.text, /Domain breakdown/, 'with an attachment, the breakdown is not repeated in the email');
  assert.doesNotMatch(logs, /welcome@example\.com/);

  // Later results are emailed only when she asks, as the short report email.
  const { id } = (await m.call('POST', '/v1/assessments', { clientPlatform: 'web' }, { 'idempotency-key': randomUUID() })).json();
  await m.call('PUT', `/v1/assessments/${id}/profile`, { age: 'profile.age.20-34', country: 'profile.country.NG', cycle: 'profile.cycle.regular', everpreg: 'profile.everpreg.no', plan: 'profile.plan.no' });
  await m.call('PUT', `/v1/assessments/${id}/answers`, { answers: allTop });
  const count = sent.length;
  await m.call('POST', `/v1/assessments/${id}/submit`, undefined, {}, withPdf);
  await settled(withPdf);
  assert.equal(sent.length, count, 'no second welcome letter');
  assert.equal((await m.call('POST', `/v1/assessments/${id}/email`, undefined, {}, withPdf)).statusCode, 202);
  assert.equal(sent.at(-1)!.subject, 'Your PreConnix Reproductive Health Score');
});

test('if the welcome letter cannot be sent, it goes with her next report email instead', async () => {
  const failing = await buildApp({ config: loadConfig({ APP_ENV: 'test' }), db, auth,
    registry: loadRegistry(), keyRing: createKeyRing(db, randomBytes(32)), mailer: { send: async () => { throw new Error('down'); } } });
  const m = await member('retry@example.com', undefined, failing);
  await failing.close();
  assert.equal((await m.call('POST', `/v1/assessments/${m.id}/email`)).statusCode, 202);
  assert.equal(sent.at(-1)!.subject, 'Welcome to PreConnix: your Reproductive Health Score');
});

test('the name she chooses in the app is kept encrypted, used to greet her, and can be removed', async () => {
  const m = await member();
  assert.equal((await m.call('PUT', '/v1/me/name', { firstName: '  Synthia ' })).json().firstName, 'Synthia');
  assert.equal((await m.call('GET', '/v1/me')).json().firstName, 'Synthia');
  const raw = await db.system.query<{ enc: Uint8Array }>('SELECT first_name_enc AS enc FROM identity.users WHERE first_name_enc IS NOT NULL');
  assert.ok(raw.rows.every(r => !Buffer.from(r.enc).toString('latin1').includes('Synthia')), 'never stored as plain text');
  assert.equal((await m.call('PUT', '/v1/me/name', { firstName: 'Ada<script>' })).statusCode, 422);
  assert.equal((await m.call('PUT', '/v1/me/name', { firstName: null })).json().firstName, null);
  assert.equal((await m.call('GET', '/v1/me')).json().firstName, null);
});

test('the welcome letter greets the member by first name when sign-up gave one', async () => {
  logs = '';
  await member('named.test@example.com', 'Synthada', withPdf);
  const mail = sent.at(-1)!;
  assert.match(mail.text, /^Hello Synthada,/);
  assert.ok(!logs.includes('Synthada'), 'names are never logged');
});

test('the app prompt goes only to people who took the assessment on the website', () => {
  const r = { overall: { score: 90, band: 'high', bandLabel: 'High' }, domains: [] } as unknown as Parameters<typeof letterEmail>[2];
  const web = letterEmail('welcome', true, r, new Date().toISOString(), undefined, true);
  const app = letterEmail('welcome', true, r, new Date().toISOString(), undefined, false);
  assert.match(web.html, /Get the PreConnix app/);
  assert.match(web.text, /Get the PreConnix app/);
  assert.doesNotMatch(app.html, /Get the PreConnix app/);
  assert.doesNotMatch(app.text, /preconnix\.com\/app/);
});

