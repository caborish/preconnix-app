// PreConnix API v1. Contract: contracts/openapi.yaml; behaviour: docs/architecture/05_api_specification.md.
import {
  applicableQuestionIds,
  applicableSections,
  bmiFrom,
  followUpOpen,
  purgeForProfile,
  score,
  validateSubmission,
  type Definition,
  type ScoreResult,
  type Submission
} from '@preconnix/assessment-engine';
import Fastify, { type FastifyRequest } from 'fastify';
import { createHash, randomUUID } from 'node:crypto';
import { cleanFirstName, STAFF_ROLES, type Authenticator, type StaffRole } from './auth.ts';
import type { Config } from './config.ts';
import type { Database, Tx } from './db/database.ts';
import type { Registry } from './registry.ts';
import { seal, unseal, type KeyRing } from './crypto.ts';
import { audit, problem } from './http.ts';
import { registerLifePlanRoutes } from './rlp.ts';
import { registerCircleRoutes } from './circle.ts';
import { registerExportRoutes } from './export.ts';
import { aiExplanationAvailable, registerExplanationRoutes, type Explainer } from './explain.ts';
import { loadSettings, registerContentRoutes } from './content.ts';
import { buildReportHtml, reportFileName, supportMessages, type ReportResult } from '@preconnix/content';
import { letterEmail } from './mail.ts';

declare module 'fastify' {
  interface FastifyRequest {
    userId?: string;
    roles?: import('./auth.ts').StaffRole[];
    /** From the member's sign-in token, only for sending them their own report. Never stored or logged. */
    memberEmail?: string;
    memberFirstName?: string;
  }
}

export interface AppDeps {
  config: Config;
  db: Database;
  auth: Authenticator;
  registry: Registry;
  keyRing: KeyRing;
  /** Sends report emails. Absent when email is not set up (the route then answers 503). */
  mailer?: import('./mail.ts').Mailer;
  /** Prints the report HTML to PDF for email attachments. Absent locally unless Chrome is configured. */
  pdf?: import('./pdf.ts').PdfRenderer;
  /** AI provider for result explanations (ADR-018). Local/test: the stand-in. Absent = feature off. */
  explainer?: Explainer;
  /** Where logs go (tests capture them). Defaults to stdout. */
  logStream?: NodeJS.WritableStream;
  engineBuild?: string;
}

const PROFILE_FIELDS = ['age', 'country', 'cycle', 'everpreg', 'plan'] as const;
/** Version 2.0 adds a required relationship field; the engine checks what each version requires. */
const PROFILE_PROPERTIES = Object.fromEntries([...PROFILE_FIELDS, 'relationship'].map(f => [f, { type: 'string', maxLength: 40 }]));
const NUMBERS_SCHEMA = { type: 'object', maxProperties: 4, propertyNames: { maxLength: 10 }, additionalProperties: { type: 'number' } };
const FOLLOW_UPS_SCHEMA = { type: 'object', maxProperties: 20, propertyNames: { maxLength: 10 }, additionalProperties: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', maxLength: 20 } } };

/** Profile field → plain value (e.g. plan → 'no'), from stored profile option ids. */
function profileValues(def: Definition, profile: Record<string, string>) {
  const values: Record<string, string> = {};
  for (const f of def.profile) {
    const v = f.options.find(o => o.id === profile[f.id])?.value;
    if (v) values[f.id] = v;
  }
  return values;
}

/** Latest consent decision for a purpose (consents are append-only). */
async function hasConsent(tx: Tx, userId: string, purpose: string): Promise<boolean> {
  const r = await tx.query<{ granted: boolean }>(
    'SELECT granted FROM identity.consents WHERE user_id = $1 AND purpose = $2 ORDER BY recorded_at DESC LIMIT 1', [userId, purpose]);
  return r.rows[0]?.granted === true;
}

/** Country code (e.g. 'NG') from stored profile option ids; drives country-specific links such as booking. */
function countryOf(def: Definition | undefined, profile: Record<string, string>): string | null {
  return def ? profileValues(def, profile).country ?? null : null;
}

function toResultResponse(assessmentId: string, r: ScoreResult, engineBuild: string, computedAt: string, sha: string, country: string | null, saved = true) {
  return {
    assessmentId,
    saved,
    country,
    pathway: r.pathway,
    definitionId: r.definitionId,
    scoringPolicyId: r.policyId,
    scoringStatus: r.scoringStatus,
    engineBuild,
    overall: { score: r.overall.score, earned: r.overall.earned, max: r.overall.max, band: r.overall.band, bandLabel: r.overall.bandLabel },
    domains: r.domains.map(d => ({ code: d.code, name: d.name, percent: d.percent, earned: d.earned, max: d.max })),
    safetyFlags: r.safetyFlags.map(f => ({ code: f.code })),
    notes: r.notes ?? [],
    bmi: r.bmi ?? null,
    support: supportMessages(r.support),
    computedAt,
    resultSha256: sha
  };
}

export async function buildApp(deps: AppDeps) {
  const { db, auth, registry } = deps;
  const engineBuild = deps.engineBuild ?? process.env.ENGINE_BUILD ?? 'local';

  const app = Fastify({
    // One proxy hop is trusted: on Azure, Container Apps' ingress adds the visitor's address to X-Forwarded-For.
    // Used only for the public route's request limit.
    trustProxy: (_address: string, hop: number) => hop === 0,
    bodyLimit: 64 * 1024,
    // Strict contract: unknown fields (e.g. a client-sent "score") are rejected, not silently dropped; no type coercion.
    ajv: { customOptions: { removeAdditional: false, coerceTypes: false, allErrors: false } },
    requestIdHeader: 'x-request-id',
    genReqId: () => `req_${randomUUID()}`,
    logger: {
      level: deps.config.env === 'test' ? 'info' : 'info',
      stream: deps.logStream,
      // Logs carry the route template, status and timing only: never bodies, query strings, params or tokens.
      serializers: {
        req: req => ({ method: req.method, route: req.routeOptions?.url ?? 'unmatched', id: req.id }),
        res: res => ({ statusCode: res.statusCode }),
        // Error messages can echo request data, so only the error type and code are kept.
        err: err => ({ type: err.name, message: err.code ?? 'error', stack: '' })
      }
    }
  });

  app.setErrorHandler((err, req, reply) => {
    if ((err as { validation?: unknown }).validation) return problem(reply, 400, 'invalid_request', 'Request does not match the API contract');
    if ((err as { statusCode?: number }).statusCode === 413) return problem(reply, 413, 'payload_too_large', 'Request body too large');
    req.log.error({ err }, 'unhandled_error');
    return problem(reply, 500, 'internal_error', 'Something went wrong');
  });
  app.setNotFoundHandler((req, reply) => problem(reply, 404, 'not_found', 'Not found'));

  const PUBLIC = new Set(['/v1/health', '/v1/assessment-definitions/current', '/v1/policies/current', '/v1/content', '/v1/public/score', '/dev/token']);
  // CORS for explicit origins only: the admin console, and the website (member and public routes, never /admin).
  // The phone app does not need CORS.
  const adminOrigins = new Set(deps.config.adminOrigins);
  const webOrigins = new Set(deps.config.webOrigins);
  app.addHook('onRequest', async (req, reply) => {
    const origin = req.headers.origin;
    const allowed = !!origin && (adminOrigins.has(origin) || (webOrigins.has(origin) && !req.url.startsWith('/admin')));
    if (!allowed) return;
    reply.header('access-control-allow-origin', origin).header('vary', 'origin');
    if (req.method === 'OPTIONS') {
      return reply.code(204)
        .header('access-control-allow-methods', 'GET, POST, PUT, PATCH, DELETE')
        .header('access-control-allow-headers', 'authorization, content-type, idempotency-key')
        .header('access-control-max-age', '600').send();
    }
  });
  app.addHook('onRequest', async (req, reply) => {
    if (req.method === 'OPTIONS') return;
    const route = req.routeOptions?.url;
    if (!route || PUBLIC.has(route)) return;
    const identity = await auth.verify(req.headers.authorization);
    if (!identity) return problem(reply, 401, 'unauthenticated', 'Sign in required');
    const subject = identity.subject;
    req.roles = identity.roles;
    req.memberEmail = identity.email;
    req.memberFirstName = identity.firstName;
    // Staff routes need a two-step sign-in outside local and test (doc 05 §Admin, PRD F1.2).
    if (route.startsWith('/admin') && deps.config.staffMfa && !identity.mfa) {
      return problem(reply, 403, 'mfa_required', 'Sign in with two-step verification to use staff tools');
    }
    const { rows } = await db.system.query<{ id: string }>(
      `INSERT INTO identity.users (idp_subject) VALUES ($1)
       ON CONFLICT (idp_subject) DO UPDATE SET idp_subject = EXCLUDED.idp_subject RETURNING id`,
      [subject]
    );
    req.userId = rows[0].id;
  });
  app.addHook('onSend', async (req, reply) => {
    if (req.routeOptions?.url?.startsWith('/v1/') && !PUBLIC.has(req.routeOptions.url)) reply.header('cache-control', 'no-store');
  });

  // ── Public ──
  app.get('/v1/health', async () => ({ status: 'ok' }));

  app.get('/v1/assessment-definitions/current', async (req, reply) => {
    reply.header('cache-control', 'max-age=300');
    const asked = (req.query as { definitionId?: string }).definitionId;
    return (asked && registry.versions.get(asked)?.definition) || registry.current.definition; // definitions contain no scores (tested)
  });

  app.get('/v1/policies/current', async () => {
    const { rows } = await db.system.query('SELECT id, kind, version, url FROM identity.policy_documents ORDER BY kind');
    return { items: rows };
  });

  if (auth.issueDevToken) {
    const issue = auth.issueDevToken;
    app.post('/dev/token', {
      schema: { body: { type: 'object', additionalProperties: false, properties: {
        subject: { type: 'string', pattern: '^dev-[A-Za-z0-9-]{1,60}$' },
        roles: { type: 'array', maxItems: 3, uniqueItems: true, items: { enum: [...STAFF_ROLES] } },
        // Synthetic addresses only, for testing report emails locally.
        email: { type: 'string', pattern: '^[a-z0-9.+-]{1,40}@example\\.com$' },
        firstName: { type: 'string', minLength: 1, maxLength: 40 },
        mfa: { type: 'boolean' } } } }
    }, async req => {
      const body = (req.body ?? {}) as { subject?: string; roles?: StaffRole[]; email?: string; firstName?: string; mfa?: boolean };
      const subject = body.subject ?? `dev-${randomUUID()}`;
      return { accessToken: await issue(subject, body.roles ?? [], body.email, body.firstName, body.mfa), subject, note: 'Local development only. Synthetic users.' };
    });
  }

  // ── Website: score without an account (BE-18) ──
  // The preconnix.com assessment sends answers here and shows the result. Same definitions, engine and policy as the
  // app; nothing is stored and nothing identifies the visitor. To keep a result, the visitor signs in and submits
  // through the normal assessment routes. A small per-address limit stops the open route being hammered.
  const publicHits = new Map<string, { n: number; since: number }>();
  const PUBLIC_LIMIT = { max: 20, windowMs: 10 * 60_000 };
  app.post('/v1/public/score', {
    bodyLimit: 16_384,
    schema: {
      body: { type: 'object', required: ['profile', 'answers'], additionalProperties: false, properties: {
        profile: { type: 'object', additionalProperties: false, required: [...PROFILE_FIELDS],
          properties: PROFILE_PROPERTIES },
        definitionId: { type: 'string', maxLength: 40 }, numbers: NUMBERS_SCHEMA, followUps: FOLLOW_UPS_SCHEMA,
        answers: { type: 'array', maxItems: 60, items: { type: 'object', required: ['questionId', 'optionId'], additionalProperties: false,
          properties: { questionId: { type: 'string', maxLength: 10 }, optionId: { type: 'string', maxLength: 12 } } } } } }
    }
  }, async (req, reply) => {
    const now = Date.now();
    const hit = publicHits.get(req.ip);
    const fresh = !hit || now - hit.since > PUBLIC_LIMIT.windowMs ? { n: 0, since: now } : hit;
    fresh.n++;
    publicHits.set(req.ip, fresh);
    if (publicHits.size > 10_000) for (const [k, v] of publicHits) if (now - v.since > PUBLIC_LIMIT.windowMs) publicHits.delete(k);
    if (fresh.n > PUBLIC_LIMIT.max) return problem(reply, 429, 'too_many_requests', 'Please wait a few minutes and try again');

    const { profile, answers, definitionId, numbers, followUps } = req.body as { profile: Record<string, string>; answers: { questionId: string; optionId: string }[];
      definitionId?: string; numbers?: Record<string, number>; followUps?: Record<string, string[]> };
    const pinned = definitionId ? registry.versions.get(definitionId) : registry.current;
    if (!pinned) return problem(reply, 410, 'definition_retired', 'This questionnaire version is no longer offered');
    const { definition: def, policy } = pinned;
    const submission: Submission = { profile, answers: Object.fromEntries(answers.map(a => [a.questionId, a.optionId])), numbers, followUps };
    const v = validateSubmission(def, submission);
    if (!v.ok) {
      const missing = v.issues.filter(i => i.code === 'missing_answer').map(i => i.ref);
      return missing.length === v.issues.length
        ? problem(reply, 409, 'assessment_incomplete', 'Assessment incomplete', { missingQuestionIds: missing })
        : problem(reply, 422, 'invalid_submission', 'Assessment has invalid answers', { issues: v.issues.map(i => i.code) });
    }
    const result = score(def, policy, submission);
    const sha = createHash('sha256').update(JSON.stringify(result)).digest('hex');
    return { ...toResultResponse('', result, engineBuild, new Date().toISOString(), sha, countryOf(def, profile), false), assessmentId: null };
  });

  /** The name she chose in the app, else the one from sign-up, else none. */
  const firstNameOf = async (req: FastifyRequest): Promise<string | undefined> => {
    const row = (await db.system.query<{ enc: Uint8Array | null }>('SELECT first_name_enc AS enc FROM identity.users WHERE id = $1', [req.userId])).rows[0];
    if (row?.enc) {
      try { return unseal(await deps.keyRing.dataKeyFor(req.userId!), row.enc); } catch { /* fall back to sign-up name */ }
    }
    return req.memberFirstName;
  };

  // ── Me, eligibility, consent ──
  app.get('/v1/me', async req => {
    const firstName = (await firstNameOf(req)) ?? null;
    return db.asUser(req.userId!, async tx => {
      const user = (await tx.query<{ eligibility_confirmed_at: string | null }>('SELECT eligibility_confirmed_at FROM identity.users WHERE id = $1', [req.userId])).rows[0];
      const consents = (await tx.query(
        `SELECT DISTINCT ON (purpose) purpose, granted, policy_document_id AS "policyDocumentId", recorded_at AS "recordedAt"
         FROM identity.consents WHERE user_id = $1 ORDER BY purpose, recorded_at DESC`, [req.userId])).rows;
      return { eligible: !!user?.eligibility_confirmed_at, consents, firstName, aiExplanation: aiExplanationAvailable(deps.config, deps.explainer) };
    });
  });

  // The name she would like to be called: optional, asked once after sign-in (5 Nov 2026). Encrypted, never logged.
  app.put('/v1/me/name', {
    schema: { body: { type: 'object', required: ['firstName'], additionalProperties: false,
      properties: { firstName: { anyOf: [{ type: 'string', maxLength: 60 }, { type: 'null' }] } } } }
  }, async (req, reply) => {
    const raw = (req.body as { firstName: string | null }).firstName;
    const name = raw === null || raw.trim() === '' ? null : cleanFirstName(raw);
    if (name === undefined) return problem(reply, 422, 'invalid_name', 'Please use letters only, up to 40');
    const enc = name ? seal(await deps.keyRing.dataKeyFor(req.userId!), name) : null;
    await db.system.query('UPDATE identity.users SET first_name_enc = $2 WHERE id = $1', [req.userId, enc]);
    return { firstName: name };
  });

  // Deletes the account and everything in it (results, plan, check-ins, Circle posts, consents). The data key goes
  // with it, so encrypted text in backups becomes unreadable. The sign-in identity stays with the sign-in service;
  // signing in again starts a new, empty account. Only the audit record of the deletion remains (no content).
  // Height, weight and pregnancy numbers, which she can come back and change (owner, 9 Nov 2026).
  const HEALTH_POLICY = registry.versions.get('rra-defs-2.0')!;
  const healthOut = (numbers: Record<string, number>, updatedAt: string | null) => {
    const bmi = bmiFrom(numbers, HEALTH_POLICY.policy);
    return { heightCm: numbers.heightCm ?? null, weightKg: numbers.weightKg ?? null, gravida: numbers.gravida ?? null, parity: numbers.parity ?? null,
      bmi: bmi ? { value: bmi.value, label: bmi.band.label } : null, updatedAt };
  };
  const nullableNumber = { type: ['number', 'null'] };
  app.get('/v1/me/health-details', async req =>
    db.asUser(req.userId!, async tx => {
      const row = (await tx.query<{ numbers: Record<string, number>; updated_at: string }>('SELECT numbers, updated_at FROM phi.health_details WHERE user_id = $1', [req.userId])).rows[0];
      return healthOut(row?.numbers ?? {}, row ? new Date(row.updated_at).toISOString() : null);
    }));
  app.put('/v1/me/health-details', {
    schema: { body: { type: 'object', additionalProperties: false, required: ['heightCm', 'weightKg', 'gravida', 'parity'],
      properties: { heightCm: nullableNumber, weightKg: nullableNumber, gravida: nullableNumber, parity: nullableNumber } } }
  }, async (req, reply) => {
    const b = req.body as { heightCm: number | null; weightKg: number | null; gravida: number | null; parity: number | null };
    const inRange = (id: string, n: number) => { const m = HEALTH_POLICY.definition.measurements!.find(x => x.id === id)!; return n >= m.min && n <= m.max; };
    const bad = (b.heightCm === null) !== (b.weightKg === null)
      || (b.heightCm !== null && (!inRange('heightCm', b.heightCm) || !inRange('weightKg', b.weightKg!)))
      || (b.parity !== null && b.gravida === null)
      || (b.gravida !== null && (!Number.isInteger(b.gravida) || b.gravida < 0 || b.gravida > 30))
      || (b.parity !== null && (!Number.isInteger(b.parity) || b.parity < 0 || b.parity > b.gravida!));
    if (bad) return problem(reply, 422, 'invalid_health_details', 'Check the numbers and try again');
    const numbers = Object.fromEntries(Object.entries(b).filter(([, v]) => v !== null)) as Record<string, number>;
    return db.asUser(req.userId!, async tx => {
      const row = (await tx.query<{ updated_at: string }>(`INSERT INTO phi.health_details (user_id, numbers) VALUES ($1, $2::jsonb)
        ON CONFLICT (user_id) DO UPDATE SET numbers = EXCLUDED.numbers, updated_at = now() RETURNING updated_at`, [req.userId, JSON.stringify(numbers)])).rows[0];
      await audit(tx, req, 'health_details.update', 'health_details', null, 'success');
      return healthOut(numbers, new Date(row.updated_at).toISOString());
    });
  });

  app.delete('/v1/me', {
    schema: { body: { type: 'object', required: ['confirm'], additionalProperties: false, properties: { confirm: { const: 'DELETE' } } } }
  }, async (req, reply) => {
    await db.system.query(
      `INSERT INTO audit.events (actor_type, actor_ref, action, resource_type, resource_id, outcome, request_id)
       VALUES ('user', $1, 'account.delete', 'user', $1, 'success', $2)`, [req.userId, req.id]);
    await db.system.query('DELETE FROM identity.users WHERE id = $1', [req.userId]);
    return reply.code(204).send();
  });

  app.post('/v1/me/eligibility', {
    schema: { body: { type: 'object', required: ['confirmedAdult'], additionalProperties: false, properties: { confirmedAdult: { const: true } } } }
  }, async (req, reply) => {
    await db.system.query('UPDATE identity.users SET eligibility_confirmed_at = coalesce(eligibility_confirmed_at, now()) WHERE id = $1', [req.userId]);
    return reply.code(204).send();
  });

  app.post('/v1/me/consents', {
    schema: {
      body: {
        type: 'object', required: ['purpose', 'granted', 'policyDocumentId', 'source'], additionalProperties: false,
        properties: {
          purpose: { enum: ['terms_privacy', 'health_processing', 'history_storage', 'email_comms', 'product_analytics', 'research_deidentified', 'ai_explanation'] },
          granted: { type: 'boolean' },
          policyDocumentId: { type: 'string', format: 'uuid' },
          source: { enum: ['ios', 'android', 'web'] }
        }
      }
    }
  }, async (req, reply) => {
    const b = req.body as { purpose: string; granted: boolean; policyDocumentId: string; source: string };
    const doc = await db.system.query('SELECT 1 FROM identity.policy_documents WHERE id = $1', [b.policyDocumentId]);
    if (!doc.rows.length) return problem(reply, 422, 'unknown_policy_document', 'Unknown policy document');
    await db.asUser(req.userId!, async tx => {
      await tx.query('INSERT INTO identity.consents (user_id, purpose, granted, policy_document_id, source) VALUES ($1,$2,$3,$4,$5)',
        [req.userId, b.purpose, b.granted, b.policyDocumentId, b.source]);
      await audit(tx, req, b.granted ? 'consent.grant' : 'consent.withdraw', 'consent', b.purpose, 'success');
    });
    return reply.code(201).send({ purpose: b.purpose, granted: b.granted });
  });

  // ── Assessments ──
  const idParam = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } };

  /** Loads the caller's assessment. Another user's id gives `null`, which routes answer with 404. */
  const loadOwn = (tx: Tx, req: FastifyRequest, id: string) =>
    tx.query<{ id: string; status: string; definition_id: string; scoring_policy_id: string; profile: Record<string, string>; pathway: string | null; started_at: string; follow_ups: Record<string, string[]>; numbers: Record<string, number>; follow_up_other_enc: Uint8Array | null; client_platform: string | null }>(
      'SELECT id, status, definition_id, scoring_policy_id, profile, pathway, started_at, follow_ups, numbers, follow_up_other_enc, client_platform FROM phi.assessments WHERE id = $1 AND user_id = $2', [id, req.userId]
    ).then(r => r.rows[0] ?? null);

  const answersOf = async (tx: Tx, id: string) =>
    Object.fromEntries((await tx.query<{ question_id: string; option_id: string }>(
      'SELECT question_id, option_id FROM phi.assessment_answers WHERE assessment_id = $1', [id])).rows.map(r => [r.question_id, r.option_id]));

  app.post('/v1/assessments', {
    schema: {
      headers: { type: 'object', required: ['idempotency-key'], properties: { 'idempotency-key': { type: 'string', format: 'uuid' } } },
      body: { type: 'object', additionalProperties: false, properties: { definitionId: { type: 'string' }, clientPlatform: { enum: ['ios', 'android', 'web'] } } }
    }
  }, async (req, reply) => {
    const body = (req.body ?? {}) as { definitionId?: string; clientPlatform?: string };
    const pinned = body.definitionId ? registry.versions.get(body.definitionId) : registry.current;
    if (!pinned) return problem(reply, 410, 'definition_retired', 'This questionnaire version is no longer offered');
    const def = pinned.definition;
    const key = req.headers['idempotency-key'] as string;
    const row = await db.asUser(req.userId!, async tx => {
      const existing = await tx.query<{ id: string }>('SELECT id FROM phi.assessments WHERE user_id = $1 AND idempotency_key = $2', [req.userId, key]);
      if (existing.rows[0]) return { id: existing.rows[0].id, created: false };
      const r = await tx.query<{ id: string }>(
        'INSERT INTO phi.assessments (user_id, definition_id, scoring_policy_id, idempotency_key, client_platform) VALUES ($1,$2,$3,$4,$5) RETURNING id',
        [req.userId, def.definitionId, pinned.policy.policyId, key, body.clientPlatform ?? null]);
      await audit(tx, req, 'assessment.create', 'assessment', r.rows[0].id, 'success');
      return { id: r.rows[0].id, created: true };
    });
    return reply.code(row.created ? 201 : 200).send({
      id: row.id, status: 'draft', definitionId: def.definitionId, scoringPolicyId: pinned.policy.policyId
    });
  });

  app.get('/v1/assessments', async req =>
    db.asUser(req.userId!, async tx => ({
      items: (await tx.query(
        `SELECT a.id, a.status, a.pathway, a.started_at AS "startedAt", a.submitted_at AS "submittedAt",
                a.scoring_policy_id AS "scoringPolicyId", r.overall_score AS score, r.band_code AS band
         FROM phi.assessments a LEFT JOIN phi.assessment_results r ON r.assessment_id = a.id
         WHERE a.user_id = $1 ORDER BY a.started_at DESC LIMIT 50`, [req.userId])).rows
    }))
  );

  app.get('/v1/assessments/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const key = await deps.keyRing.dataKeyFor(req.userId!);
    const out = await db.asUser(req.userId!, async tx => {
      const a = await loadOwn(tx, req, id);
      if (!a) return null;
      return { id: a.id, status: a.status, definitionId: a.definition_id, scoringPolicyId: a.scoring_policy_id, pathway: a.pathway,
        profile: a.profile, answers: await answersOf(tx, id), followUps: a.follow_ups, numbers: a.numbers,
        followUpOther: a.follow_up_other_enc ? JSON.parse(unseal(key, a.follow_up_other_enc)) : {}, startedAt: a.started_at };
    });
    return out ?? problem(reply, 404, 'not_found', 'Not found');
  });

  app.put('/v1/assessments/:id/profile', {
    schema: {
      params: idParam,
      body: { type: 'object', additionalProperties: false, required: [...PROFILE_FIELDS],
        properties: PROFILE_PROPERTIES }
    }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const profile = req.body as Record<string, string>;
    return db.asUser(req.userId!, async tx => {
      const a = await loadOwn(tx, req, id);
      if (!a) return problem(reply, 404, 'not_found', 'Not found');
      if (a.status !== 'draft') return problem(reply, 409, 'assessment_not_draft', 'This assessment is already submitted');
      const def = registry.definitions.get(a.definition_id)!;
      const v = validateSubmission(def, { profile, answers: {} });
      const profileIssues = v.issues.filter(i => i.code === 'missing_profile' || i.code === 'invalid_profile_option');
      if (profileIssues.length || !v.pathway) return problem(reply, 422, 'invalid_profile_option', 'Invalid profile answer', { fields: profileIssues.map(i => i.ref) });
      const { purged } = purgeForProfile(def, await answersOf(tx, id), v.values);
      if (purged.length) await tx.query('DELETE FROM phi.assessment_answers WHERE assessment_id = $1 AND question_id = ANY($2::text[])', [id, purged]);
      await tx.query('UPDATE phi.assessments SET profile = $2::jsonb, pathway = $3 WHERE id = $1', [id, JSON.stringify(profile), v.pathway]);
      return { pathway: v.pathway, applicableSections: applicableSections(def, v.values).map(s => s.id), purgedQuestionIds: purged };
    });
  });

  app.put('/v1/assessments/:id/answers', {
    schema: {
      params: idParam,
      body: { type: 'object', required: ['answers'], additionalProperties: false, properties: {
        answers: { type: 'array', maxItems: 60, items: { type: 'object', required: ['questionId', 'optionId'], additionalProperties: false,
          properties: { questionId: { type: 'string', maxLength: 10 }, optionId: { type: 'string', maxLength: 12 } } } },
        followUps: { type: 'object', maxProperties: 20, propertyNames: { maxLength: 10 }, additionalProperties: { type: 'array', uniqueItems: true, maxItems: 20, items: { type: 'string', maxLength: 20 } } },
        numbers: NUMBERS_SCHEMA,
        followUpOther: { type: 'object', maxProperties: 20, propertyNames: { maxLength: 10 }, additionalProperties: { type: 'string', maxLength: 120 } } } }
    }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { answers, followUps, numbers, followUpOther } = req.body as { answers: { questionId: string; optionId: string }[]; followUps?: Record<string, string[]>;
      numbers?: Record<string, number>; followUpOther?: Record<string, string> };
    const key = followUpOther ? await deps.keyRing.dataKeyFor(req.userId!) : null;
    return db.asUser(req.userId!, async tx => {
      const a = await loadOwn(tx, req, id);
      if (!a) return problem(reply, 404, 'not_found', 'Not found');
      if (a.status !== 'draft') return problem(reply, 409, 'assessment_not_draft', 'This assessment is already submitted');
      const def = registry.definitions.get(a.definition_id)!;
      const values = profileValues(def, a.profile);
      if (!a.pathway) return problem(reply, 409, 'profile_required', 'Answer the profile questions first');
      // Whether a question applies can depend on other answers, saved or in this request.
      const merged = { ...await answersOf(tx, id), ...Object.fromEntries(answers.map(x => [x.questionId, x.optionId])) };
      const applicable = new Set(applicableQuestionIds(def, values, merged));
      const questions = new Map(def.sections.flatMap(s => s.questions).map(q => [q.id, q]));
      for (const ans of answers) {
        const q = questions.get(ans.questionId);
        if (!q) return problem(reply, 422, 'unknown_question', 'Unknown question', { questionId: ans.questionId });
        if (!applicable.has(q.id)) return problem(reply, 422, 'question_not_applicable', 'Question does not apply', { questionId: q.id });
        if (!q.options.some(o => o.id === ans.optionId)) return problem(reply, 422, 'invalid_option', 'Invalid option', { questionId: q.id });
      }
      for (const ans of answers) {
        await tx.query(
          `INSERT INTO phi.assessment_answers (assessment_id, user_id, question_id, option_id) VALUES ($1,$2,$3,$4)
           ON CONFLICT (assessment_id, question_id) DO UPDATE SET option_id = EXCLUDED.option_id, answered_at = now()`,
          [id, req.userId, ans.questionId, ans.optionId]);
      }
      const { purged } = purgeForProfile(def, merged, values);
      if (purged.length) await tx.query('DELETE FROM phi.assessment_answers WHERE assessment_id = $1 AND question_id = ANY($2::text[])', [id, purged]);
      if (followUps) {
        const bad = Object.entries(followUps).find(([qid, ticked]) => {
          const q = questions.get(qid);
          return !q || !followUpOpen(q, merged[qid]) || !ticked.every(t => q.followUp!.options.some(o => o.id === t));
        });
        if (bad) return problem(reply, 422, 'invalid_follow_up', 'Invalid follow-up answer', { questionId: bad[0] });
        await tx.query('UPDATE phi.assessments SET follow_ups = $2::jsonb WHERE id = $1', [id, JSON.stringify(followUps)]);
      }
      if (numbers) await tx.query('UPDATE phi.assessments SET numbers = $2::jsonb WHERE id = $1', [id, JSON.stringify(numbers)]);
      if (followUpOther && key) {
        const cleaned = Object.fromEntries(Object.entries(followUpOther).map(([q, t]) => [q, t.trim()]).filter(([q, t]) => t && followUps?.[q]?.includes('other')));
        await tx.query('UPDATE phi.assessments SET follow_up_other_enc = $2 WHERE id = $1', [id, Object.keys(cleaned).length ? seal(key, JSON.stringify(cleaned)) : null]);
      }
      reply.code(204);
      return null;
    });
  });

  app.post('/v1/assessments/:id/submit', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    let fresh: { report: ReportResult; result: ScoreResult; fromWebsite: boolean } | null = null;
    const out = await db.asUser(req.userId!, async tx => {
      const a = await loadOwn(tx, req, id);
      if (!a) return problem(reply, 404, 'not_found', 'Not found');

      const stored = await tx.query<{ result: ScoreResult; computed_at: string; result_sha256: string }>(
        'SELECT result, computed_at, result_sha256 FROM phi.assessment_results WHERE assessment_id = $1', [id]);
      if (stored.rows[0]) {
        const s = stored.rows[0];
        return toResultResponse(id, s.result, engineBuild, new Date(s.computed_at).toISOString(), s.result_sha256, countryOf(registry.definitions.get(a.definition_id), a.profile));
      }

      const user = (await tx.query<{ eligibility_confirmed_at: string | null }>('SELECT eligibility_confirmed_at FROM identity.users WHERE id = $1', [req.userId])).rows[0];
      if (!user?.eligibility_confirmed_at) return problem(reply, 412, 'eligibility_required', 'Please confirm you are 18 or older');
      if (!(await hasConsent(tx, req.userId!, 'health_processing'))) return problem(reply, 412, 'consent_required', 'Consent to process health information is required');

      const def = registry.definitions.get(a.definition_id)!;
      const policy = registry.policies.get(a.scoring_policy_id)!;
      const submission: Submission = { profile: a.profile, answers: await answersOf(tx, id), followUps: a.follow_ups, numbers: a.numbers };
      const v = validateSubmission(def, submission);
      if (!v.ok) {
        const missing = v.issues.filter(i => i.code === 'missing_answer').map(i => i.ref);
        await audit(tx, req, 'assessment.submit', 'assessment', id, 'denied');
        return missing.length === v.issues.length
          ? problem(reply, 409, 'assessment_incomplete', 'Assessment incomplete', { missingQuestionIds: missing })
          : problem(reply, 422, 'invalid_submission', 'Assessment has invalid answers', { issues: v.issues.map(i => i.code) });
      }

      const result = score(def, policy, submission);
      const canonical = JSON.stringify(result);
      const sha = createHash('sha256').update(canonical).digest('hex');
      const computed = await tx.query<{ computed_at: string }>(
        `INSERT INTO phi.assessment_results (assessment_id, user_id, overall_score, band_code, earned_points, max_points, scored_item_count, result, result_sha256)
         VALUES ($1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9) RETURNING computed_at`,
        [id, req.userId, result.overall.score, result.overall.band, result.overall.earned, result.overall.max, result.scoredItemCount, canonical, sha]);
      await tx.query(`UPDATE phi.assessments SET status = 'scored', submitted_at = now() WHERE id = $1`, [id]);
      await audit(tx, req, 'assessment.submit', 'assessment', id, 'success');
      const computedAt = new Date(computed.rows[0].computed_at).toISOString();
      fresh = { report: reportOf(result, computedAt, def, a.profile), result, fromWebsite: a.client_platform === 'web' };

      // Without the history-storage consent, nothing is kept once the result has been returned.
      if (!(await hasConsent(tx, req.userId!, 'history_storage'))) {
        await tx.query('DELETE FROM phi.assessments WHERE id = $1 AND user_id = $2', [id, req.userId]);
        await audit(tx, req, 'assessment.discard_unsaved', 'assessment', id, 'success');
        return toResultResponse(id, result, engineBuild, computedAt, sha, countryOf(def, a.profile), false);
      }
      // She can see and change these in Account; the next assessment starts from them.
      if (Object.keys(a.numbers).length) {
        await tx.query(`INSERT INTO phi.health_details (user_id, numbers) VALUES ($1, $2::jsonb)
          ON CONFLICT (user_id) DO UPDATE SET numbers = phi.health_details.numbers || EXCLUDED.numbers, updated_at = now()`, [req.userId, JSON.stringify(a.numbers)]);
      }
      return toResultResponse(id, result, engineBuild, computedAt, sha, countryOf(def, a.profile), true);
    });
    if (fresh) sendWelcomeOnce(req, id, fresh);
    return out;
  });

  // Dr Gloria's welcome letter goes by itself after the first assessment an account completes (owner and Dr Gloria,
  // 5 Nov 2026); later results are emailed only when she asks. Sent in the background so the result is not held up.
  // If sending fails, the letter stays due and goes with her next report email instead.
  const background = new Set<Promise<void>>();
  app.decorate('settled', async () => { await Promise.all([...background]); });
  const sendWelcomeOnce = (req: FastifyRequest, id: string, r: { report: ReportResult; result: ScoreResult; fromWebsite: boolean }) => {
    const mailer = deps.mailer;
    const to = req.memberEmail;
    if (!mailer || !to) return;
    const job: Promise<void> = (async () => {
      const claimed = await db.system.query('UPDATE identity.users SET welcome_email_at = now() WHERE id = $1 AND welcome_email_at IS NULL RETURNING id', [req.userId]);
      if (!claimed.rows.length) return;
      try {
        const pdf = deps.pdf ? await deps.pdf.render(await reportHtmlFor(r.report)) : null;
        await mailer.send({
          to,
          ...letterEmail('welcome', !!pdf, r.result, r.report.computedAt, await firstNameOf(req), r.fromWebsite),
          ...(pdf ? { attachments: [{ name: reportFileName(r.report), contentType: 'application/pdf', contentInBase64: pdf.toString('base64') }] } : {})
        });
        await audit(db.system, req, 'assessment.welcome_email', 'assessment', id, 'success');
      } catch {
        await db.system.query('UPDATE identity.users SET welcome_email_at = NULL WHERE id = $1', [req.userId]);
        await audit(db.system, req, 'assessment.welcome_email', 'assessment', id, 'error');
      }
    })().catch(() => undefined).finally(() => { background.delete(job); });
    background.add(job);
  };

  /** A result in the shape the shared report template takes. */
  function reportOf(r: ScoreResult, computedAt: string, def: Parameters<typeof countryOf>[0], profile: Record<string, string>): ReportResult {
    return {
      pathway: r.pathway as ReportResult['pathway'], country: countryOf(def, profile),
      overall: { score: r.overall.score, band: r.overall.band as ReportResult['overall']['band'], bandLabel: r.overall.bandLabel },
      domains: r.domains.map(d => ({ code: d.code, name: d.name, percent: d.percent })), safetyFlags: r.safetyFlags.map(f => ({ code: f.code })),
      notes: [...(r.notes ?? []), ...(r.reportNotes ?? [])], computedAt
    };
  }

  /** A member's own saved result, in the shape the shared report template takes. */
  const ownReport = (req: FastifyRequest, id: string) =>
    db.asUser(req.userId!, async tx => {
      const row = (await tx.query<{ result: ScoreResult; computed_at: string; profile: Record<string, string>; definition_id: string; client_platform: string | null }>(
        `SELECT r.result, r.computed_at, a.profile, a.definition_id, a.client_platform FROM phi.assessment_results r JOIN phi.assessments a ON a.id = r.assessment_id
         WHERE r.assessment_id = $1 AND r.user_id = $2`, [id, req.userId])).rows[0];
      if (!row) return null;
      const r = row.result;
      return { result: r, fromWebsite: row.client_platform === 'web', report: reportOf(r, new Date(row.computed_at).toISOString(), registry.definitions.get(row.definition_id), row.profile) };
    });

  /** The report in the same design as the app's PDF (shared template), for the website to print or save as PDF. */
  const reportHtmlFor = async (report: ReportResult) => {
    const settings = await loadSettings(db);
    return buildReportHtml(report, {
      testWatermark: deps.config.env !== 'production',
      consultation: { url: settings.consultationUrl, countries: settings.consultationCountries }
    });
  };

  app.get('/v1/assessments/:id/report', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const own = await ownReport(req, id);
    if (!own) return problem(reply, 404, 'not_found', 'Not found');
    return { html: await reportHtmlFor(own.report), fileName: reportFileName(own.report) };
  });

  // Emails the member their own saved report, to their sign-in address only (they forward it to their doctor).
  // Five a day per member is plenty and stops misuse. Neither the address nor the content is logged.
  const emailsSent = new Map<string, number[]>();
  app.post('/v1/assessments/:id/email', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!deps.mailer) return problem(reply, 503, 'email_unavailable', 'Emailing reports is not available yet');
    if (!req.memberEmail) return problem(reply, 409, 'no_email', 'Sign in with your email to have your report sent to you');
    const now = Date.now();
    const recent = (emailsSent.get(req.userId!) ?? []).filter(t => now - t < 86_400_000);
    if (recent.length >= 5) return problem(reply, 429, 'too_many_requests', 'You can email your report up to 5 times a day');
    const own = await ownReport(req, id);
    if (!own) return problem(reply, 404, 'not_found', 'Not found');
    // The first email an account receives is the welcome letter from Dr Gloria; later ones are the short report email.
    const welcomed = (await db.system.query<{ at: string | null }>('SELECT welcome_email_at AS at FROM identity.users WHERE id = $1', [req.userId])).rows[0]?.at;
    try {
      const pdf = deps.pdf ? await deps.pdf.render(await reportHtmlFor(own.report)) : null;
      await deps.mailer.send({
        to: req.memberEmail,
        ...letterEmail(welcomed ? 'report' : 'welcome', !!pdf, own.result, own.report.computedAt, await firstNameOf(req), own.fromWebsite),
        ...(pdf ? { attachments: [{ name: reportFileName(own.report), contentType: 'application/pdf', contentInBase64: pdf.toString('base64') }] } : {})
      });
      if (!welcomed) await db.system.query('UPDATE identity.users SET welcome_email_at = now() WHERE id = $1', [req.userId]);
    } catch {
      await audit(db.system, req, 'assessment.report_email', 'assessment', id, 'error');
      return problem(reply, 502, 'email_failed', 'Your report could not be emailed. Please try again later');
    }
    emailsSent.set(req.userId!, [...recent, now]);
    await audit(db.system, req, 'assessment.report_email', 'assessment', id, 'success');
    reply.code(202);
    return { sent: true };
  });

  app.get('/v1/assessments/:id/result', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const out = await db.asUser(req.userId!, async tx => {
      const r = await tx.query<{ result: ScoreResult; computed_at: string; result_sha256: string; profile: Record<string, string>; definition_id: string }>(
        `SELECT r.result, r.computed_at, r.result_sha256, a.profile, a.definition_id
         FROM phi.assessment_results r JOIN phi.assessments a ON a.id = r.assessment_id
         WHERE r.assessment_id = $1 AND r.user_id = $2`, [id, req.userId]);
      return r.rows[0] ?? null;
    });
    return out
      ? toResultResponse(id, out.result, engineBuild, new Date(out.computed_at).toISOString(), out.result_sha256, countryOf(registry.definitions.get(out.definition_id), out.profile))
      : problem(reply, 404, 'not_found', 'Not found');
  });

  app.delete('/v1/assessments', async (req, reply) => {
    const deleted = await db.asUser(req.userId!, async tx => {
      const r = await tx.query('DELETE FROM phi.assessments WHERE user_id = $1 RETURNING id', [req.userId]);
      await audit(tx, req, 'assessment.delete_all', 'assessment', null, 'success');
      return r.rows.length;
    });
    return reply.code(200).send({ deleted });
  });

  app.delete('/v1/assessments/:id', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const deleted = await db.asUser(req.userId!, async tx => {
      const r = await tx.query('DELETE FROM phi.assessments WHERE id = $1 AND user_id = $2 RETURNING id', [id, req.userId]);
      if (r.rows.length) await audit(tx, req, 'assessment.delete', 'assessment', id, 'success');
      return r.rows.length > 0;
    });
    return deleted ? reply.code(204).send() : problem(reply, 404, 'not_found', 'Not found');
  });

  registerLifePlanRoutes(app, { db, keyRing: deps.keyRing, registry });
  registerCircleRoutes(app, { db });
  registerExportRoutes(app, { db });
  registerExplanationRoutes(app, { db, registry, config: deps.config, explainer: deps.explainer, countryOf });
  registerContentRoutes(app, { db, allowDraftPreview: deps.config.env === 'local' || deps.config.env === 'test' });

  return app;
}

/** Synthetic policy documents for local/test. Real texts and versions come from counsel (H-11). */
export async function seedPolicyDocuments(db: Database) {
  for (const kind of ['terms', 'privacy', 'health_consent']) {
    await db.system.query(
      `INSERT INTO identity.policy_documents (kind, version, url) VALUES ($1, 'draft-2026-10', $2) ON CONFLICT (kind, version) DO NOTHING`,
      [kind, `https://preconnix.com/${kind === 'terms' ? 'terms' : 'privacy'}/`]);
  }
}
