// Member sign-in tokens (Entra External ID) next to the dev signer. A local key server stands in for Entra.
import { after, before, test } from 'node:test';
import assert from 'node:assert/strict';
import { createServer, type Server } from 'node:http';
import { exportJWK, generateKeyPair, SignJWT, type CryptoKey } from 'jose';
import { createAuthenticator, type Authenticator } from '../src/auth.ts';
import { loadConfig } from '../src/config.ts';

let server: Server;
let privateKey: CryptoKey;
let auth: Authenticator;
const member = { issuer: 'https://tenant.example/v2.0', audience: 'api-client-id', jwksUrl: '' };

before(async () => {
  const pair = await generateKeyPair('RS256');
  privateKey = pair.privateKey;
  const jwk = { ...(await exportJWK(pair.publicKey)), kid: 'k1', alg: 'RS256', use: 'sig' };
  server = createServer((_req, res) => { res.setHeader('content-type', 'application/json'); res.end(JSON.stringify({ keys: [jwk] })); });
  await new Promise<void>(r => server.listen(0, '127.0.0.1', r));
  member.jwksUrl = `http://127.0.0.1:${(server.address() as { port: number }).port}/keys`;
  const config = loadConfig({ APP_ENV: 'test' });
  auth = await createAuthenticator({ ...config, auth: { ...config.auth, member } });
});
after(() => { server.close(); });

const memberToken = (claims: Record<string, unknown>, opts: { issuer?: string; audience?: string; exp?: string } = {}) =>
  new SignJWT(claims)
    .setProtectedHeader({ alg: 'RS256', kid: 'k1' })
    .setIssuer(opts.issuer ?? member.issuer)
    .setAudience(opts.audience ?? member.audience)
    .setSubject('abc123')
    .setIssuedAt()
    .setExpirationTime(opts.exp ?? '10m')
    .sign(privateKey);

test('a member token from the sign-in directory is accepted, with its own subject namespace', async () => {
  assert.deepEqual(await auth.verify(`Bearer ${await memberToken({})}`), { subject: 'entra:abc123', roles: [], mfa: false });
});

test('member tokens never grant staff roles', async () => {
  const id = await auth.verify(`Bearer ${await memberToken({ roles: ['moderator', 'clinical_reviewer'] })}`);
  assert.deepEqual(id?.roles, []);
});

test('wrong audience, wrong issuer or expired member tokens are refused', async () => {
  assert.equal(await auth.verify(`Bearer ${await memberToken({}, { audience: 'other-app' })}`), null);
  assert.equal(await auth.verify(`Bearer ${await memberToken({}, { issuer: 'https://evil.example/v2.0' })}`), null);
  assert.equal(await auth.verify(`Bearer ${await memberToken({}, { exp: '-1m' })}`), null);
});

test('dev tokens still work in local/test, and member sign-in is off unless configured', async () => {
  const dev = await auth.issueDevToken!('dev-someone', ['moderator']);
  assert.deepEqual(await auth.verify(`Bearer ${dev}`), { subject: 'dev-someone', roles: ['moderator'], mfa: false });
  assert.equal(loadConfig({ APP_ENV: 'test' }).auth.member, undefined);
  assert.ok(loadConfig({ APP_ENV: 'local' }).auth.member);
  assert.equal(loadConfig({ APP_ENV: 'local', MEMBER_SIGN_IN: 'off' }).auth.member, undefined);
});

test('staging needs its database, Key Vault and member sign-in settings, and has no dev sign-in', async () => {
  assert.throws(() => loadConfig({ APP_ENV: 'staging' }), /DATABASE_URL, KEY_VAULT_URL, MEMBER_OIDC_ISSUER/);
  const config = loadConfig({
    APP_ENV: 'staging', DATABASE_URL: 'postgres://api@server/db', KEY_VAULT_URL: 'https://kv.vault.azure.net/',
    MEMBER_OIDC_ISSUER: member.issuer, MEMBER_OIDC_AUDIENCE: member.audience, MEMBER_OIDC_JWKS_URL: member.jwksUrl
  });
  assert.equal(config.database?.auth, 'entra');
  assert.deepEqual(config.adminOrigins, []);
  const staging = await createAuthenticator(config);
  assert.equal(staging.issueDevToken, undefined, 'no dev sign-in outside local/test');
  assert.deepEqual(await staging.verify(`Bearer ${await memberToken({ roles: ['moderator'] })}`), { subject: 'entra:abc123', roles: [], mfa: false });
});
