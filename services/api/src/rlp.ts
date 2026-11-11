// Reproductive Life Plan (PRD F9) and home dashboard. Goal, note and action text is encrypted with the
// user's data key before it reaches the database; only the API can read it, and only for that user.
import { bmiFrom } from '@preconnix/assessment-engine';
import { draftPlan, supportMessages } from '@preconnix/content';
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import type { KeyRing } from './crypto.ts';
import { seal, unseal } from './crypto.ts';
import type { Database, Tx } from './db/database.ts';
import { audit, problem } from './http.ts';
import type { Registry } from './registry.ts';

export const GOAL_CATEGORIES = [
  'checkups_screening', 'nutrition_supplements', 'lifestyle', 'mental_wellbeing', 'relationships_support',
  'contraception_planning', 'finances_housing', 'learning', 'other'
] as const;
const INTENTIONS = ['planning_now', 'planning_later', 'unsure', 'not_planning', 'prefer_not_say'];
const HORIZONS = ['within_1y', '1_2y', '3_5y', '5y_plus', 'not_sure'];
const FAMILY_PICTURES = ['with_partner', 'on_my_own', 'adopt_foster', 'no_children', 'not_sure', 'prefer_not_say'];
const SUPPORT = ['partner', 'family', 'friends', 'health_worker', 'faith', 'community', 'no_one_yet'];
const MAX_QUESTIONS = 10;
const RHYTHMS = ['once', 'daily', 'weekly', 'monthly'] as const;
const UNITS = ['km', 'minutes', 'days', 'times'] as const;
const MAX_GOALS = 50;
const MAX_ACTIONS_PER_GOAL = 30;
/** Check-ins returned with each goal, and how far back one can be recorded. */
const CHECKIN_DAYS = 70;

const title = { type: 'string', minLength: 1, maxLength: 120 };
const notes = { type: ['string', 'null'], maxLength: 1000 };
const date = { type: 'string', format: 'date' };
const nullableDate = { type: ['string', 'null'], format: 'date' };
const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } };
const amount = { type: 'number', exclusiveMinimum: 0, maximum: 100000 };
const target = { type: ['object', 'null'], required: ['amount', 'unit'], additionalProperties: false, properties: { amount, unit: { enum: [...UNITS] } } };
const checkinParams = { type: 'object', required: ['id', 'day'], properties: { id: { type: 'string', format: 'uuid' }, day: date } };

interface GoalRow {
  id: string; category: string; title_enc: Uint8Array; notes_enc: Uint8Array | null; target_date: string | null; status: string; source_domain: string | null;
  rhythm: string; target_amount: number | null; target_unit: string | null;
}
interface CheckinRow { goal_id: string; day: string; amount: number | null }
type Target = { amount: number; unit: string } | null;
interface ActionRow { id: string; goal_id: string; title_enc: Uint8Array; due_date: string | null; done_at: string | null }

const GOAL_COLS = `id, category, title_enc, notes_enc, to_char(target_date, 'YYYY-MM-DD') AS target_date, status, source_domain,
  rhythm, target_amount::float8 AS target_amount, target_unit`;
const PLAN_COLS = `intention, horizon, to_char(review_date, 'YYYY-MM-DD') AS review_date, setup_completed_at IS NOT NULL AS setup_complete,
  family_picture, support, essentials_done, provider_questions_enc, source_assessment_id, essentials_focus`;
interface PlanRow {
  intention: string | null; horizon: string | null; review_date: string | null; setup_complete: boolean;
  family_picture: string | null; support: string[]; essentials_done: string[]; provider_questions_enc: Uint8Array | null;
  source_assessment_id: string | null; essentials_focus: string[] | null;
}
const toPlan = (key: Buffer, p: PlanRow | undefined) => ({
  intention: p?.intention ?? null, horizon: p?.horizon ?? null, reviewDate: p?.review_date ?? null, setupComplete: p?.setup_complete ?? false,
  familyPicture: p?.family_picture ?? null, support: p?.support ?? [], essentialsDone: p?.essentials_done ?? [],
  providerQuestions: p?.provider_questions_enc ? (JSON.parse(unseal(key, p.provider_questions_enc)) as string[]) : [],
  sourceAssessmentId: p?.source_assessment_id ?? null, essentialsFocus: p?.essentials_focus ?? null
});
const CHECKIN_COLS = `goal_id, to_char(day, 'YYYY-MM-DD') AS day, amount::float8 AS amount`;

/** YYYY-MM-DD `days` from today (UTC). Check-in days are the person's local dates, so a day either side is allowed. */
const isoDay = (days: number) => new Date(Date.now() + days * 86_400_000).toISOString().slice(0, 10);
const ACTION_COLS = `id, goal_id, title_enc, to_char(due_date, 'YYYY-MM-DD') AS due_date, done_at`;

export function registerLifePlanRoutes(app: FastifyInstance, deps: { db: Database; keyRing: KeyRing; registry: Registry }) {
  const { db, keyRing, registry } = deps;

  const toAction = (key: Buffer, a: ActionRow) => ({ id: a.id, goalId: a.goal_id, title: unseal(key, a.title_enc), dueDate: a.due_date, done: a.done_at !== null });
  const toGoal = (key: Buffer, g: GoalRow, actions: ActionRow[], checkins: CheckinRow[] = []) => ({
    id: g.id,
    category: g.category,
    title: unseal(key, g.title_enc),
    notes: g.notes_enc ? unseal(key, g.notes_enc) : null,
    targetDate: g.target_date,
    status: g.status,
    sourceDomain: g.source_domain,
    rhythm: g.rhythm,
    target: g.target_amount !== null && g.target_unit ? { amount: g.target_amount, unit: g.target_unit } : null,
    actions: actions.filter(a => a.goal_id === g.id).map(a => toAction(key, a)),
    checkins: checkins.filter(c => c.goal_id === g.id).map(c => ({ day: c.day, amount: c.amount }))
  });
  /** A target only makes sense for a goal that repeats. */
  const targetProblem = (rhythm: string, t: Target) => (t && rhythm === 'once' ? 'A one-off goal has no weekly or daily target' : null);

  /** Runs `fn` as the signed-in user with their data key. */
  const withUser = async <T>(req: FastifyRequest, fn: (tx: Tx, key: Buffer, userId: string) => Promise<T>) => {
    const key = await keyRing.dataKeyFor(req.userId!);
    return db.asUser(req.userId!, tx => fn(tx, key, req.userId!));
  };

  const loadGoal = async (tx: Tx, userId: string, id: string) =>
    (await tx.query<GoalRow>(`SELECT ${GOAL_COLS} FROM phi.rlp_goals WHERE id = $1 AND user_id = $2`, [id, userId])).rows[0] ?? null;
  const actionsOf = async (tx: Tx, goalId: string) =>
    (await tx.query<ActionRow>(`SELECT ${ACTION_COLS} FROM phi.rlp_actions WHERE goal_id = $1 ORDER BY created_at`, [goalId])).rows;
  const checkinsOf = async (tx: Tx, userId: string, goalId?: string) =>
    (await tx.query<CheckinRow>(
      `SELECT ${CHECKIN_COLS} FROM phi.rlp_checkins WHERE user_id = $1 AND day >= $2::date ${goalId ? 'AND goal_id = $3' : ''} ORDER BY day`,
      goalId ? [userId, isoDay(-CHECKIN_DAYS), goalId] : [userId, isoDay(-CHECKIN_DAYS)])).rows;

  // ── Plan ──
  app.get('/v1/rlp', async req =>
    withUser(req, async (tx, key, userId) => {
      const plan = (await tx.query<PlanRow>(`SELECT ${PLAN_COLS} FROM phi.rlp_plans WHERE user_id = $1`, [userId])).rows[0];
      const goals = (await tx.query<GoalRow>(`SELECT ${GOAL_COLS} FROM phi.rlp_goals WHERE user_id = $1 ORDER BY created_at`, [userId])).rows;
      const actions = (await tx.query<ActionRow>(`SELECT ${ACTION_COLS} FROM phi.rlp_actions WHERE user_id = $1 ORDER BY created_at`, [userId])).rows;
      const checkins = await checkinsOf(tx, userId);
      return { ...toPlan(key, plan), goals: goals.map(g => toGoal(key, g, actions, checkins)) };
    })
  );

  app.patch('/v1/rlp', {
    schema: { body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      intention: { enum: [...INTENTIONS, null] }, horizon: { enum: [...HORIZONS, null] }, reviewDate: nullableDate,
      setupComplete: { const: true }, familyPicture: { enum: [...FAMILY_PICTURES, null] },
      support: { type: 'array', uniqueItems: true, maxItems: SUPPORT.length, items: { enum: SUPPORT } },
      essentialsDone: { type: 'array', uniqueItems: true, maxItems: 50, items: { type: 'string', pattern: '^[a-z_]{2,40}$' } },
      providerQuestions: { type: 'array', maxItems: MAX_QUESTIONS, items: { type: 'string', minLength: 1, maxLength: 200 } },
      sourceAssessmentId: { type: 'string', format: 'uuid' }, essentialsFocus: { type: 'array', uniqueItems: true, maxItems: 50, items: { type: 'string', pattern: '^[a-z_]{2,40}$' } } } } }
  }, async (req, reply) => {
    const b = req.body as { intention?: string | null; horizon?: string | null; reviewDate?: string | null; setupComplete?: true;
      familyPicture?: string | null; support?: string[]; essentialsDone?: string[]; providerQuestions?: string[]; sourceAssessmentId?: string; essentialsFocus?: string[] };
    if (b.reviewDate && (b.reviewDate < isoDay(-1) || b.reviewDate > isoDay(3 * 366))) {
      return problem(reply, 400, 'invalid_review_date', 'Choose a review date within the next three years');
    }
    return withUser(req, async (tx, key, userId) => {
      const questions = b.providerQuestions?.map(q => q.trim()).filter(Boolean);
      const r = await tx.query<PlanRow>(
        `INSERT INTO phi.rlp_plans (user_id, intention, horizon, review_date, setup_completed_at, family_picture, support, essentials_done, provider_questions_enc, source_assessment_id, essentials_focus)
         VALUES ($1, $2, $3, $4, CASE WHEN $8 THEN now() END, $9, coalesce($10, '{}'::text[]), coalesce($11, '{}'::text[]), $12, $15::uuid, $16::text[])
         ON CONFLICT (user_id) DO UPDATE SET
           intention = CASE WHEN $5 THEN EXCLUDED.intention ELSE phi.rlp_plans.intention END,
           horizon = CASE WHEN $6 THEN EXCLUDED.horizon ELSE phi.rlp_plans.horizon END,
           review_date = CASE WHEN $7 THEN EXCLUDED.review_date ELSE phi.rlp_plans.review_date END,
           setup_completed_at = CASE WHEN $8 THEN coalesce(phi.rlp_plans.setup_completed_at, now()) ELSE phi.rlp_plans.setup_completed_at END,
           family_picture = CASE WHEN $13 THEN EXCLUDED.family_picture ELSE phi.rlp_plans.family_picture END,
           support = CASE WHEN $10::text[] IS NOT NULL THEN EXCLUDED.support ELSE phi.rlp_plans.support END,
           essentials_done = CASE WHEN $11::text[] IS NOT NULL THEN EXCLUDED.essentials_done ELSE phi.rlp_plans.essentials_done END,
           provider_questions_enc = CASE WHEN $14 THEN EXCLUDED.provider_questions_enc ELSE phi.rlp_plans.provider_questions_enc END,
           source_assessment_id = coalesce($15::uuid, phi.rlp_plans.source_assessment_id),
           essentials_focus = coalesce($16::text[], phi.rlp_plans.essentials_focus),
           updated_at = now()
         RETURNING ${PLAN_COLS}`,
        [userId, b.intention ?? null, b.horizon ?? null, b.reviewDate ?? null, 'intention' in b, 'horizon' in b, 'reviewDate' in b, b.setupComplete === true,
          b.familyPicture ?? null, b.support ?? null, b.essentialsDone ?? null,
          questions?.length ? seal(key, JSON.stringify(questions)) : null, 'familyPicture' in b, questions !== undefined, b.sourceAssessmentId ?? null, b.essentialsFocus ?? null]);
      await audit(tx, req, 'rlp.update', 'rlp_plan', null, 'success');
      return toPlan(key, r.rows[0]);
    });
  });

  // A draft plan from her latest saved assessment, only when she asks for one. Nothing is saved here: she edits it
  // and accepts it through the ordinary plan routes. The answers stay on the server (Dr Gloria, Review 3).
  app.get('/v1/rlp/draft', async (req, reply) =>
    withUser(req, async (tx, key, userId) => {
      const a = (await tx.query<{ id: string; definition_id: string; scoring_policy_id: string; profile: Record<string, string>; follow_ups: Record<string, string[]>;
        result: { pathway: 'pregnancy_planning' | 'general_wellness'; domains: { code: string; percent: number }[]; bmi?: { band: string } } }>(
        `SELECT a.id, a.definition_id, a.scoring_policy_id, a.profile, a.follow_ups, r.result FROM phi.assessment_results r JOIN phi.assessments a ON a.id = r.assessment_id
         WHERE r.user_id = $1 ORDER BY r.computed_at DESC LIMIT 1`, [userId])).rows[0];
      if (!a) return problem(reply, 404, 'no_assessment', 'Take the assessment first');
      const answers = Object.fromEntries((await tx.query<{ question_id: string; option_id: string }>(
        'SELECT question_id, option_id FROM phi.assessment_answers WHERE assessment_id = $1', [a.id])).rows.map(r => [r.question_id, r.option_id]));
      const taken = (await tx.query<{ title_enc: Uint8Array; status: string }>(`SELECT title_enc, status FROM phi.rlp_goals WHERE user_id = $1 AND status <> 'archived'`, [userId])).rows;
      const saved = (await tx.query<{ numbers: Record<string, number> }>('SELECT numbers FROM phi.health_details WHERE user_id = $1', [userId])).rows[0]?.numbers ?? {};
      const percent = new Map(a.result.domains.map(d => [d.code, d.percent]));
      const areaPercent: Record<string, number> = {};
      for (const d of registry.policies.get(a.scoring_policy_id)?.domains[a.result.pathway] ?? []) {
        for (const item of d.items) if (percent.has(d.code)) areaPercent[item] = percent.get(d.code)!;
      }
      await audit(tx, req, 'rlp.draft', 'rlp_plan', null, 'success');
      // The words she saw, so each goal can show which of her answers put it there.
      const def = registry.definitions.get(a.definition_id);
      const answerText: Record<string, { question: string; answer: string }> = {};
      for (const q of def?.sections.flatMap(s => s.questions) ?? []) {
        const option = q.options.find(o => o.id === answers[q.id]);
        if (option) answerText[q.id] = { question: q.text, answer: option.label };
      }
      // Height and weight she has since changed in Account count; otherwise those from this assessment.
      const policy = registry.versions.get('rra-defs-2.0')?.policy;
      const latestBmi = policy ? bmiFrom(saved, policy)?.band.code : undefined;
      const profile = Object.fromEntries(Object.entries(a.profile).map(([field, option]) => [field, option.replace(`profile.${field}.`, '')]));
      return draftPlan({
        pathway: a.result.pathway, profile,
        noPartner: ['single', 'separated'].includes(profile.relationship), bmiBand: latestBmi ?? a.result.bmi?.band ?? null,
        assessmentId: a.id, answerText, openTitles: taken.filter(t => t.status === 'open').map(t => unseal(key, t.title_enc)),
        answers, followUps: a.follow_ups, areaPercent, takenTitles: taken.map(t => unseal(key, t.title_enc))
      });
    })
  );

  // ── Goals ──
  app.post('/v1/rlp/goals', {
    schema: { body: { type: 'object', required: ['category', 'title'], additionalProperties: false, properties: {
      category: { enum: [...GOAL_CATEGORIES] }, title, notes, targetDate: nullableDate,
      sourceDomain: { type: 'string', pattern: '^[a-z_]{2,40}$' }, rhythm: { enum: [...RHYTHMS] }, target } } }
  }, async (req, reply) => {
    const b = req.body as { category: string; title: string; notes?: string | null; targetDate?: string | null; sourceDomain?: string; rhythm?: string; target?: Target };
    const rhythm = b.rhythm ?? 'once';
    const bad = targetProblem(rhythm, b.target ?? null);
    if (bad) return problem(reply, 400, 'invalid_target', bad);
    return withUser(req, async (tx, key, userId) => {
      const count = (await tx.query<{ n: number }>('SELECT count(*)::int AS n FROM phi.rlp_goals WHERE user_id = $1', [userId])).rows[0].n;
      if (count >= MAX_GOALS) return problem(reply, 409, 'too_many_goals', `A plan can hold up to ${MAX_GOALS} goals`);
      const g = (await tx.query<GoalRow>(
        `INSERT INTO phi.rlp_goals (user_id, category, title_enc, notes_enc, target_date, source_domain, rhythm, target_amount, target_unit)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9) RETURNING ${GOAL_COLS}`,
        [userId, b.category, seal(key, b.title.trim()), b.notes ? seal(key, b.notes) : null, b.targetDate ?? null, b.sourceDomain ?? null,
          rhythm, b.target?.amount ?? null, b.target?.unit ?? null])).rows[0];
      await audit(tx, req, 'rlp.goal.create', 'rlp_goal', g.id, 'success');
      reply.code(201);
      return toGoal(key, g, []);
    });
  });

  app.patch('/v1/rlp/goals/:id', {
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      category: { enum: [...GOAL_CATEGORIES] }, title, notes, targetDate: nullableDate, status: { enum: ['open', 'done', 'archived'] },
      rhythm: { enum: [...RHYTHMS] }, target } } }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { category?: string; title?: string; notes?: string | null; targetDate?: string | null; status?: string; rhythm?: string; target?: Target };
    return withUser(req, async (tx, key, userId) => {
      const g = await loadGoal(tx, userId, id);
      if (!g) return problem(reply, 404, 'not_found', 'Not found');
      const rhythm = b.rhythm ?? g.rhythm;
      // Switching to a one-off goal drops its target unless a new one is given.
      const nextTarget: Target = 'target' in b ? b.target ?? null
        : rhythm === 'once' ? null : g.target_amount !== null && g.target_unit ? { amount: g.target_amount, unit: g.target_unit } : null;
      const bad = targetProblem(rhythm, nextTarget);
      if (bad) return problem(reply, 400, 'invalid_target', bad);
      const updated = (await tx.query<GoalRow>(
        `UPDATE phi.rlp_goals SET
           category = $3, title_enc = $4, notes_enc = $5, target_date = $6, status = $7,
           rhythm = $8, target_amount = $9, target_unit = $10, updated_at = now()
         WHERE id = $1 AND user_id = $2 RETURNING ${GOAL_COLS}`,
        [id, userId, b.category ?? g.category,
          b.title !== undefined ? seal(key, b.title.trim()) : g.title_enc,
          'notes' in b ? (b.notes ? seal(key, b.notes) : null) : g.notes_enc,
          'targetDate' in b ? b.targetDate : g.target_date,
          b.status ?? g.status, rhythm, nextTarget?.amount ?? null, nextTarget?.unit ?? null])).rows[0];
      await audit(tx, req, 'rlp.goal.update', 'rlp_goal', id, 'success');
      return toGoal(key, updated, await actionsOf(tx, id), await checkinsOf(tx, userId, id));
    });
  });

  app.delete('/v1/rlp/goals/:id', { schema: { params: idParams } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return withUser(req, async (tx, _key, userId) => {
      const r = await tx.query('DELETE FROM phi.rlp_goals WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
      if (!r.rows.length) return problem(reply, 404, 'not_found', 'Not found');
      await audit(tx, req, 'rlp.goal.delete', 'rlp_goal', id, 'success');
      reply.code(204);
      return null;
    });
  });

  // ── Check-ins (one per goal per day: done, or an amount in the goal's unit) ──
  const checkinDayProblem = (day: string) =>
    day < isoDay(-CHECKIN_DAYS) || day > isoDay(1) ? `Check-ins can be recorded for the last ${CHECKIN_DAYS} days only` : null;

  app.put('/v1/rlp/goals/:id/checkins/:day', {
    schema: { params: checkinParams, body: { type: 'object', additionalProperties: false, properties: { amount: { anyOf: [amount, { type: 'null' }] } } } }
  }, async (req, reply) => {
    const { id, day } = req.params as { id: string; day: string };
    const b = (req.body ?? {}) as { amount?: number | null };
    const bad = checkinDayProblem(day);
    if (bad) return problem(reply, 400, 'invalid_day', bad);
    return withUser(req, async (tx, _key, userId) => {
      const g = await loadGoal(tx, userId, id);
      if (!g) return problem(reply, 404, 'not_found', 'Not found');
      if (g.rhythm === 'once') return problem(reply, 409, 'not_repeating', 'A one-off goal has steps, not check-ins');
      const c = (await tx.query<CheckinRow>(
        `INSERT INTO phi.rlp_checkins (goal_id, user_id, day, amount) VALUES ($1, $2, $3, $4)
         ON CONFLICT (goal_id, day) DO UPDATE SET amount = EXCLUDED.amount
         RETURNING ${CHECKIN_COLS}`, [id, userId, day, b.amount ?? null])).rows[0];
      await audit(tx, req, 'rlp.checkin.record', 'rlp_goal', id, 'success');
      return { day: c.day, amount: c.amount };
    });
  });

  app.delete('/v1/rlp/goals/:id/checkins/:day', { schema: { params: checkinParams } }, async (req, reply) => {
    const { id, day } = req.params as { id: string; day: string };
    return withUser(req, async (tx, _key, userId) => {
      const r = await tx.query('DELETE FROM phi.rlp_checkins WHERE goal_id = $1 AND day = $2 AND user_id = $3 RETURNING day', [id, day, userId]);
      if (!r.rows.length) return problem(reply, 404, 'not_found', 'Not found');
      await audit(tx, req, 'rlp.checkin.remove', 'rlp_goal', id, 'success');
      reply.code(204);
      return null;
    });
  });

  // ── Actions ──
  app.post('/v1/rlp/goals/:id/actions', {
    schema: { params: idParams, body: { type: 'object', required: ['title'], additionalProperties: false, properties: { title, dueDate: nullableDate } } }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { title: string; dueDate?: string | null };
    return withUser(req, async (tx, key, userId) => {
      if (!(await loadGoal(tx, userId, id))) return problem(reply, 404, 'not_found', 'Not found');
      if ((await actionsOf(tx, id)).length >= MAX_ACTIONS_PER_GOAL) return problem(reply, 409, 'too_many_actions', `A goal can hold up to ${MAX_ACTIONS_PER_GOAL} actions`);
      const a = (await tx.query<ActionRow>(
        `INSERT INTO phi.rlp_actions (goal_id, user_id, title_enc, due_date) VALUES ($1, $2, $3, $4) RETURNING ${ACTION_COLS}`,
        [id, userId, seal(key, b.title.trim()), b.dueDate ?? null])).rows[0];
      await audit(tx, req, 'rlp.action.create', 'rlp_action', a.id, 'success');
      reply.code(201);
      return toAction(key, a);
    });
  });

  const loadAction = async (tx: Tx, userId: string, id: string) =>
    (await tx.query<ActionRow>(`SELECT ${ACTION_COLS} FROM phi.rlp_actions WHERE id = $1 AND user_id = $2`, [id, userId])).rows[0] ?? null;

  app.patch('/v1/rlp/actions/:id', {
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: { title, dueDate: nullableDate, done: { type: 'boolean' } } } }
  }, async (req, reply: FastifyReply) => {
    const { id } = req.params as { id: string };
    const b = req.body as { title?: string; dueDate?: string | null; done?: boolean };
    return withUser(req, async (tx, key, userId) => {
      const a = await loadAction(tx, userId, id);
      if (!a) return problem(reply, 404, 'not_found', 'Not found');
      const updated = (await tx.query<ActionRow>(
        `UPDATE phi.rlp_actions SET title_enc = $3, due_date = $4,
           done_at = CASE WHEN $5::boolean IS NULL THEN done_at WHEN $5 THEN coalesce(done_at, now()) ELSE NULL END
         WHERE id = $1 AND user_id = $2 RETURNING ${ACTION_COLS}`,
        [id, userId, b.title !== undefined ? seal(key, b.title.trim()) : a.title_enc, 'dueDate' in b ? b.dueDate : a.due_date, b.done ?? null])).rows[0];
      await audit(tx, req, 'rlp.action.update', 'rlp_action', id, 'success');
      return toAction(key, updated);
    });
  });

  app.delete('/v1/rlp/actions/:id', { schema: { params: idParams } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return withUser(req, async (tx, _key, userId) => {
      const r = await tx.query('DELETE FROM phi.rlp_actions WHERE id = $1 AND user_id = $2 RETURNING id', [id, userId]);
      if (!r.rows.length) return problem(reply, 404, 'not_found', 'Not found');
      await audit(tx, req, 'rlp.action.delete', 'rlp_action', id, 'success');
      reply.code(204);
      return null;
    });
  });

  // ── Home dashboard ──
  app.get('/v1/dashboard', async req =>
    withUser(req, async (tx, key, userId) => {
      const plan = (await tx.query<{ intention: string | null; horizon: string | null }>(
        'SELECT intention, horizon FROM phi.rlp_plans WHERE user_id = $1', [userId])).rows[0];
      const latest = (await tx.query<{ assessment_id: string; computed_at: string; country: string | null; result: {
        pathway: string; overall: { score: number; band: string; bandLabel: string }; domains: { code: string; name: string; percent: number }[]; support?: string[] } }>(
        `SELECT r.assessment_id, r.computed_at, r.result,
                replace(a.profile->>'country', 'profile.country.', '') AS country
         FROM phi.assessment_results r JOIN phi.assessments a ON a.id = r.assessment_id
         WHERE r.user_id = $1 ORDER BY r.computed_at DESC LIMIT 1`, [userId])).rows[0];
      const counts = (await tx.query<{ status: string; n: number }>(
        'SELECT status, count(*)::int AS n FROM phi.rlp_goals WHERE user_id = $1 GROUP BY status', [userId])).rows;
      const open = (await tx.query<ActionRow & { goal_title_enc: Uint8Array }>(
        `SELECT a.id, a.goal_id, a.title_enc, to_char(a.due_date, 'YYYY-MM-DD') AS due_date, a.done_at, g.title_enc AS goal_title_enc
         FROM phi.rlp_actions a JOIN phi.rlp_goals g ON g.id = a.goal_id
         WHERE a.user_id = $1 AND a.done_at IS NULL AND g.status = 'open'
         ORDER BY a.due_date ASC NULLS LAST, a.created_at ASC LIMIT 5`, [userId])).rows;
      // The name she chose in the app (encrypted), else the one from sign-up, for the greeting.
      const nameEnc = (await tx.query<{ enc: Uint8Array | null }>('SELECT first_name_enc AS enc FROM identity.users WHERE id = $1', [userId])).rows[0]?.enc;
      let chosen: string | null = null;
      try { chosen = nameEnc ? unseal(key, nameEnc) : null; } catch { chosen = null; }
      return {
        firstName: chosen ?? req.memberFirstName ?? null,
        intention: plan?.intention ?? null,
        horizon: plan?.horizon ?? null,
        latestResult: latest
          ? {
              assessmentId: latest.assessment_id,
              country: latest.country,
              computedAt: new Date(latest.computed_at).toISOString(),
              pathway: latest.result.pathway,
              score: latest.result.overall.score,
              band: latest.result.overall.band,
              bandLabel: latest.result.overall.bandLabel,
              support: supportMessages(latest.result.support),
              focus: latest.result.domains
                .map((d, order) => ({ code: d.code, name: d.name, percent: d.percent, order }))
                .sort((a, b) => a.percent - b.percent || a.order - b.order)
                .slice(0, 3)
                .map(({ order: _o, ...d }) => d)
            }
          : null,
        goals: { open: counts.find(c => c.status === 'open')?.n ?? 0, done: counts.find(c => c.status === 'done')?.n ?? 0 },
        nextActions: open.map(a => ({ ...toAction(key, a), goalTitle: unseal(key, a.goal_title_enc) }))
      };
    })
  );
}
