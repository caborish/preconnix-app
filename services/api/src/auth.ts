// Bearer-token verification. Staging/production: Entra External ID JWKS. Local/test: an in-process dev signer.
import { createRemoteJWKSet, generateKeyPair, jwtVerify, SignJWT, type CryptoKey, type JWTVerifyGetKey } from 'jose';
import type { Config } from './config.ts';

/**
 * Staff roles carried in the token's `roles` claim (Entra app roles in production).
 * moderator: runs the Circle. content_editor: drafts lessons, edits settings.
 * clinical_reviewer: approves lessons (never their own edits). No role can browse members' health data.
 */
export const STAFF_ROLES = ['moderator', 'content_editor', 'clinical_reviewer'] as const;
export type StaffRole = (typeof STAFF_ROLES)[number];

export interface Identity {
  subject: string;
  /** Member's sign-in email (email-code sign-in), for sending their own report. Used per request; never stored or logged. */
  email?: string;
  /** Member's first name from sign-up (given_name), for greetings in the app and emails. Never stored or logged. */
  firstName?: string;
  roles: StaffRole[];
  /** The sign-in used two steps (token `amr` includes "mfa"). Required for staff outside local and test. */
  mfa: boolean;
}

/** A first name fit for a greeting: letters, spaces, hyphens and apostrophes, at most 40 characters. */
export function cleanFirstName(value: unknown): string | undefined {
  if (typeof value !== 'string') return undefined;
  const s = value.trim().replace(/\s+/g, ' ');
  return /^[\p{L}][\p{L}\p{M}' -]{0,39}$/u.test(s) ? s : undefined;
}

export interface Authenticator {
  /** Returns the token's identity, or null if the token is missing or invalid. */
  verify(authorization: string | undefined): Promise<Identity | null>;
  /** Local/test only: issues a short-lived token for a synthetic subject. */
  issueDevToken?: (subject: string, roles?: StaffRole[], email?: string, firstName?: string, mfa?: boolean) => Promise<string>;
}

export async function createAuthenticator(config: Config): Promise<Authenticator> {
  const { issuer, audience } = config.auth;
  let key: CryptoKey | JWTVerifyGetKey | null = null;
  let issueDevToken: Authenticator['issueDevToken'];

  if (config.auth.jwksUrl) {
    key = createRemoteJWKSet(new URL(config.auth.jwksUrl));
  } else if (config.env === 'local' || config.env === 'test') {
    const pair = await generateKeyPair('ES256');
    key = pair.publicKey;
    issueDevToken = (subject, roles = [], email, firstName, mfa) =>
      new SignJWT({ roles, ...(email ? { email } : {}), ...(firstName ? { given_name: firstName } : {}), ...(mfa ? { amr: ['mfa'] } : {}) })
        .setProtectedHeader({ alg: 'ES256' })
        .setIssuer(issuer)
        .setAudience(audience)
        .setSubject(subject)
        .setIssuedAt()
        .setExpirationTime('15m')
        .sign(pair.privateKey);
  }

  const member = config.auth.member;
  const memberKeys = member ? createRemoteJWKSet(new URL(member.jwksUrl)) : null;

  return {
    async verify(authorization) {
      const m = /^Bearer ([A-Za-z0-9._-]+)$/.exec(authorization ?? '');
      if (!m) return null;
      if (key) try {
        const { payload } = await jwtVerify(m[1], key as JWTVerifyGetKey, { issuer, audience, algorithms: ['ES256', 'RS256'] });
        if (typeof payload.sub !== 'string' || !payload.sub) return null;
        const claimed = Array.isArray(payload.roles) ? payload.roles : [];
        const roles = STAFF_ROLES.filter(r => claimed.includes(r));
        const firstName = cleanFirstName(payload.given_name);
        const mfa = Array.isArray(payload.amr) && payload.amr.includes('mfa');
        return { subject: payload.sub, roles, mfa, ...(typeof payload.email === 'string' ? { email: payload.email } : {}), ...(firstName ? { firstName } : {}) };
      } catch {
        // Not a token from the main issuer: try member sign-in below.
      }
      if (!member || !memberKeys) return null;
      try {
        const { payload } = await jwtVerify(m[1], memberKeys, { issuer: member.issuer, audience: member.audience, algorithms: ['RS256'] });
        if (typeof payload.sub !== 'string' || !payload.sub) return null;
        // Members never get staff roles, whatever the token says.
        const email = typeof payload.email === 'string' && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(payload.email) ? payload.email : undefined;
        const firstName = cleanFirstName(payload.given_name);
        return { subject: `entra:${payload.sub}`, roles: [], mfa: false, ...(email ? { email } : {}), ...(firstName ? { firstName } : {}) };
      } catch {
        return null;
      }
    },
    issueDevToken
  };
}
