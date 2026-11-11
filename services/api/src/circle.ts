// Circle: a weekly question with an optional poll. Members answer under a system-generated username;
// every answer waits for a moderator, who also posts a general educational response. Global (all countries).
import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { randomInt } from 'node:crypto';
import type { Database, Tx } from './db/database.ts';
import { audit, problem, requireRole } from './http.ts';

const ADJECTIVES = ['Calm', 'Bright', 'Gentle', 'Brave', 'Kind', 'Sunny', 'Quiet', 'Steady', 'Warm', 'Clever', 'Hopeful', 'Bold', 'Merry', 'Swift', 'Wise'];
const NOUNS = ['Heron', 'River', 'Maple', 'Robin', 'Cedar', 'Willow', 'Falcon', 'Meadow', 'Comet', 'Harbor', 'Lark', 'Fern', 'Ember', 'Coral', 'Orchid'];

export function generateHandle(): string {
  return `${ADJECTIVES[randomInt(ADJECTIVES.length)]}${NOUNS[randomInt(NOUNS.length)]}${randomInt(10, 1000)}`;
}

// Answers must not carry contact details or links: they protect members' privacy and stop spam.
const CONTACT_PATTERNS = [
  /https?:\/\/|www\.|\b[a-z0-9-]+\.(com|net|org|ng|ca|io|co)\b/i,
  /[\w.+-]+@[\w-]+\.[\w.]+/,
  /(?:\+?\d[\s-]?){7,}/
];
// Posts mentioning safety concerns are not blocked, but moderators see them first and the
// author is shown where to get help.
const ATTENTION_WORDS = /\b(suicid\w*|kill myself|self[- ]?harm|hurt myself|end my life|abus\w*|rape\w*|violen\w*|beat(s|en)? me|unsafe|emergency)\b/i;

export function screenAnswer(body: string): { ok: true; needsAttention: boolean } | { ok: false; reason: 'contact_details' } {
  if (CONTACT_PATTERNS.some(p => p.test(body))) return { ok: false, reason: 'contact_details' };
  return { ok: true, needsAttention: ATTENTION_WORDS.test(body) };
}

interface QuestionRow { id: string; prompt: string; poll_options: string[]; status: string; response: string | null; published_at: string | null }

export function registerCircleRoutes(app: FastifyInstance, deps: { db: Database }) {
  const { db } = deps;
  const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } };

  async function ensureHandle(userId: string): Promise<string> {
    const existing = await db.system.query<{ handle: string }>('SELECT handle FROM identity.user_handles WHERE user_id = $1', [userId]);
    if (existing.rows[0]) return existing.rows[0].handle;
    for (let i = 0; i < 20; i++) {
      const r = await db.system.query<{ handle: string }>(
        'INSERT INTO identity.user_handles (user_id, handle) VALUES ($1, $2) ON CONFLICT DO NOTHING RETURNING handle', [userId, generateHandle()]);
      if (r.rows[0]) return r.rows[0].handle;
      const again = await db.system.query<{ handle: string }>('SELECT handle FROM identity.user_handles WHERE user_id = $1', [userId]);
      if (again.rows[0]) return again.rows[0].handle;
    }
    throw new Error('Could not allocate a username');
  }

  /** What a member sees for one question. Poll totals appear after voting, or once the question is closed. */
  async function view(tx: Tx, userId: string, q: QuestionRow) {
    const myVote = (await tx.query<{ option_index: number }>(
      'SELECT option_index FROM phi.circle_votes WHERE question_id = $1 AND user_id = $2', [q.id, userId])).rows[0]?.option_index ?? null;
    const showTotals = myVote !== null || q.status === 'closed';
    let totals: number[] | null = null;
    if (showTotals && q.poll_options.length) {
      // Inside the member's transaction (a second connection here would wait on this one).
      const counts = (await tx.query<{ option_index: number; n: number }>('SELECT option_index, n FROM circle.poll_totals($1)', [q.id])).rows;
      totals = q.poll_options.map((_, i) => counts.find(c => c.option_index === i)?.n ?? 0);
    }
    const answers = (await tx.query<{ id: string; body: string; status: string; created_at: string; mine: boolean; handle: string }>(
      `SELECT a.id, a.body, a.status, a.created_at, (a.user_id = $2) AS mine, h.handle
       FROM phi.circle_answers a JOIN identity.user_handles h ON h.user_id = a.user_id
       WHERE a.question_id = $1 AND a.status <> 'rejected'
         AND a.user_id NOT IN (SELECT blocked_user_id FROM phi.circle_blocks WHERE user_id = $2)
       ORDER BY a.created_at`, [q.id, userId])).rows;
    return {
      id: q.id,
      prompt: q.prompt,
      status: q.status,
      publishedAt: q.published_at ? new Date(q.published_at).toISOString() : null,
      poll: q.poll_options.length ? { options: q.poll_options, myVote, totals } : null,
      response: q.response,
      answers: answers.map(a => ({
        id: a.id, handle: a.handle, body: a.body, mine: a.mine,
        status: a.status as 'pending' | 'approved', createdAt: new Date(a.created_at).toISOString()
      }))
    };
  }

  const loadQuestion = async (tx: Tx, id: string) =>
    (await tx.query<QuestionRow>('SELECT id, prompt, poll_options, status, response, published_at FROM circle.questions WHERE id = $1', [id])).rows[0] ?? null;

  // ── Members ──
  app.get('/v1/circle/me', async req => ({ handle: await ensureHandle(req.userId!) }));

  app.get('/v1/circle/current', async (req, reply) => {
    await ensureHandle(req.userId!);
    return db.asUser(req.userId!, async tx => {
      const q = (await tx.query<QuestionRow>(
        `SELECT id, prompt, poll_options, status, response, published_at FROM circle.questions
         WHERE status = 'published' ORDER BY published_at DESC LIMIT 1`)).rows[0];
      return q ? view(tx, req.userId!, q) : problem(reply, 404, 'no_question', 'No question this week yet');
    });
  });

  app.get('/v1/circle/questions', async req =>
    db.asUser(req.userId!, async tx => ({
      items: (await tx.query<{ id: string; prompt: string; status: string; published_at: string }>(
        `SELECT id, prompt, status, published_at FROM circle.questions ORDER BY published_at DESC LIMIT 52`)).rows
        .map(q => ({ id: q.id, prompt: q.prompt, status: q.status, publishedAt: new Date(q.published_at).toISOString() }))
    }))
  );

  app.get('/v1/circle/questions/:id', { schema: { params: idParams } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    return db.asUser(req.userId!, async tx => {
      const q = await loadQuestion(tx, id);
      return q ? view(tx, req.userId!, q) : problem(reply, 404, 'not_found', 'Not found');
    });
  });

  app.post('/v1/circle/questions/:id/vote', {
    schema: { params: idParams, body: { type: 'object', required: ['option'], additionalProperties: false, properties: { option: { type: 'integer', minimum: 0, maximum: 4 } } } }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { option } = req.body as { option: number };
    return db.asUser(req.userId!, async tx => {
      const q = await loadQuestion(tx, id);
      if (!q) return problem(reply, 404, 'not_found', 'Not found');
      if (q.status !== 'published') return problem(reply, 409, 'question_closed', 'This question is closed');
      if (option >= q.poll_options.length) return problem(reply, 422, 'invalid_option', 'Invalid poll option');
      await tx.query(
        `INSERT INTO phi.circle_votes (question_id, user_id, option_index) VALUES ($1, $2, $3)
         ON CONFLICT (question_id, user_id) DO UPDATE SET option_index = EXCLUDED.option_index, voted_at = now()`, [id, req.userId, option]);
      return view(tx, req.userId!, q);
    });
  });

  app.post('/v1/circle/questions/:id/answers', {
    schema: { params: idParams, body: { type: 'object', required: ['body'], additionalProperties: false, properties: { body: { type: 'string', minLength: 2, maxLength: 1000 } } } }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const body = (req.body as { body: string }).body.trim();
    const screened = screenAnswer(body);
    if (!screened.ok) return problem(reply, 422, 'contact_details', 'Please remove links, emails and phone numbers. Answers are shared with everyone in the Circle.');
    await ensureHandle(req.userId!);
    return db.asUser(req.userId!, async tx => {
      const q = await loadQuestion(tx, id);
      if (!q) return problem(reply, 404, 'not_found', 'Not found');
      if (q.status !== 'published') return problem(reply, 409, 'question_closed', 'This question is closed');
      const pending = (await tx.query<{ n: number }>(
        `SELECT count(*)::int AS n FROM phi.circle_answers WHERE question_id = $1 AND user_id = $2 AND status = 'pending'`, [id, req.userId])).rows[0].n;
      if (pending >= 3) return problem(reply, 429, 'too_many_pending', 'Please wait for your earlier answers to be reviewed');
      const a = (await tx.query<{ id: string }>(
        'INSERT INTO phi.circle_answers (question_id, user_id, body, needs_attention) VALUES ($1, $2, $3, $4) RETURNING id',
        [id, req.userId, body, screened.needsAttention])).rows[0];
      await audit(tx, req, 'circle.answer.create', 'circle_answer', a.id, 'success');
      reply.code(201);
      return { id: a.id, status: 'pending', showSupport: screened.needsAttention };
    });
  });

  app.post('/v1/circle/answers/:id/report', {
    schema: { params: idParams, body: { type: 'object', required: ['reason'], additionalProperties: false, properties: { reason: { enum: ['harmful', 'offensive', 'spam', 'personal_info', 'other'] } } } }
  }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const { reason } = req.body as { reason: string };
    return db.asUser(req.userId!, async tx => {
      const visible = await tx.query(`SELECT 1 FROM phi.circle_answers WHERE id = $1 AND status = 'approved'`, [id]);
      if (!visible.rows.length) return problem(reply, 404, 'not_found', 'Not found');
      await tx.query('INSERT INTO phi.circle_reports (answer_id, reporter_id, reason) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [id, req.userId, reason]);
      await audit(tx, req, 'circle.answer.report', 'circle_answer', id, 'success');
      reply.code(204);
      return null;
    });
  });

  app.post('/v1/circle/blocks', {
    schema: { body: { type: 'object', required: ['handle'], additionalProperties: false, properties: { handle: { type: 'string', maxLength: 30 } } } }
  }, async (req, reply) => {
    const { handle } = req.body as { handle: string };
    const target = (await db.system.query<{ user_id: string }>('SELECT user_id FROM identity.user_handles WHERE handle = $1', [handle])).rows[0];
    if (!target || target.user_id === req.userId) return problem(reply, 404, 'not_found', 'Not found');
    await db.asUser(req.userId!, tx => tx.query('INSERT INTO phi.circle_blocks (user_id, blocked_user_id) VALUES ($1, $2) ON CONFLICT DO NOTHING', [req.userId, target.user_id]));
    return reply.code(204).send();
  });

  app.delete('/v1/circle/blocks/:handle', async (req, reply) => {
    const { handle } = req.params as { handle: string };
    const target = (await db.system.query<{ user_id: string }>('SELECT user_id FROM identity.user_handles WHERE handle = $1', [handle])).rows[0];
    if (target) await db.asUser(req.userId!, tx => tx.query('DELETE FROM phi.circle_blocks WHERE user_id = $1 AND blocked_user_id = $2', [req.userId, target.user_id]));
    return reply.code(204).send();
  });

  // ── Moderators (role "moderator"; Entra app role in production) ──
  const requireModerator = (req: FastifyRequest, reply: FastifyReply) => requireRole(req, reply, 'moderator');

  app.get('/admin/v1/circle/queue', async (req, reply) => {
    if (!requireModerator(req, reply)) return reply;
    const pending = (await db.system.query(
      `SELECT a.id, a.body, a.needs_attention AS "needsAttention", a.created_at AS "createdAt", h.handle, q.prompt
       FROM phi.circle_answers a JOIN identity.user_handles h ON h.user_id = a.user_id JOIN circle.questions q ON q.id = a.question_id
       WHERE a.status = 'pending' ORDER BY a.needs_attention DESC, a.created_at ASC LIMIT 100`)).rows;
    const reported = (await db.system.query(
      `SELECT a.id, a.body, h.handle, count(r.*)::int AS reports, array_agg(DISTINCT r.reason) AS reasons
       FROM phi.circle_answers a JOIN phi.circle_reports r ON r.answer_id = a.id JOIN identity.user_handles h ON h.user_id = a.user_id
       WHERE a.status = 'approved' GROUP BY a.id, a.body, h.handle ORDER BY reports DESC LIMIT 100`)).rows;
    return { pending, reported };
  });

  app.post('/admin/v1/circle/answers/:id/decision', {
    schema: { params: idParams, body: { type: 'object', required: ['decision'], additionalProperties: false, properties: { decision: { enum: ['approve', 'reject'] } } } }
  }, async (req, reply) => {
    if (!requireModerator(req, reply)) return reply;
    const { id } = req.params as { id: string };
    const { decision } = req.body as { decision: 'approve' | 'reject' };
    const r = await db.system.query(
      `UPDATE phi.circle_answers SET status = $2, moderated_at = now(), moderated_by = $3 WHERE id = $1 RETURNING id`,
      [id, decision === 'approve' ? 'approved' : 'rejected', req.userId]);
    if (!r.rows.length) return problem(reply, 404, 'not_found', 'Not found');
    await audit(db.system, req, `circle.answer.${decision}`, 'circle_answer', id, 'success', 'admin');
    return reply.code(204).send();
  });

  app.get('/admin/v1/circle/questions', async (req, reply) => {
    if (!requireModerator(req, reply)) return reply;
    return { items: (await db.system.query('SELECT id, prompt, poll_options AS "pollOptions", status, response, published_at AS "publishedAt" FROM circle.questions ORDER BY created_at DESC LIMIT 100')).rows };
  });

  app.post('/admin/v1/circle/questions', {
    schema: { body: { type: 'object', required: ['prompt'], additionalProperties: false, properties: {
      prompt: { type: 'string', minLength: 5, maxLength: 300 },
      pollOptions: { type: 'array', maxItems: 5, items: { type: 'string', minLength: 1, maxLength: 40 } },
      publish: { type: 'boolean' } } } }
  }, async (req, reply) => {
    if (!requireModerator(req, reply)) return reply;
    const b = req.body as { prompt: string; pollOptions?: string[]; publish?: boolean };
    if (b.pollOptions && b.pollOptions.length === 1) return problem(reply, 422, 'poll_needs_two_options', 'A poll needs at least two options');
    if (b.publish) await db.system.query(`UPDATE circle.questions SET status = 'closed' WHERE status = 'published'`);
    const q = (await db.system.query<{ id: string }>(
      `INSERT INTO circle.questions (prompt, poll_options, status, published_at) VALUES ($1, $2::jsonb, $3, $4) RETURNING id`,
      [b.prompt.trim(), JSON.stringify(b.pollOptions ?? []), b.publish ? 'published' : 'draft', b.publish ? new Date().toISOString() : null])).rows[0];
    await audit(db.system, req, 'circle.question.create', 'circle_question', q.id, 'success', 'admin');
    return reply.code(201).send({ id: q.id });
  });

  app.patch('/admin/v1/circle/questions/:id', {
    schema: { params: idParams, body: { type: 'object', additionalProperties: false, minProperties: 1, properties: {
      response: { type: ['string', 'null'], maxLength: 2000 },
      responseReviewedBy: { type: ['string', 'null'], maxLength: 120 },
      status: { enum: ['draft', 'published', 'closed'] } } } }
  }, async (req, reply) => {
    if (!requireModerator(req, reply)) return reply;
    const { id } = req.params as { id: string };
    const b = req.body as { response?: string | null; responseReviewedBy?: string | null; status?: string };
    if (b.status === 'published') await db.system.query(`UPDATE circle.questions SET status = 'closed' WHERE status = 'published' AND id <> $1`, [id]);
    const r = await db.system.query(
      `UPDATE circle.questions SET
         response = CASE WHEN $2 THEN $3 ELSE response END,
         response_reviewed_by = CASE WHEN $4 THEN $5 ELSE response_reviewed_by END,
         status = coalesce($6, status),
         published_at = CASE WHEN $6 = 'published' AND published_at IS NULL THEN now() ELSE published_at END
       WHERE id = $1 RETURNING id`,
      [id, 'response' in b, b.response ?? null, 'responseReviewedBy' in b, b.responseReviewedBy ?? null, b.status ?? null]);
    if (!r.rows.length) return problem(reply, 404, 'not_found', 'Not found');
    await audit(db.system, req, 'circle.question.update', 'circle_question', id, 'success', 'admin');
    return reply.code(204).send();
  });
}

/** Local development only: one published sample question so the Circle is not empty. */
export async function seedSampleCircleQuestion(db: Database) {
  const any = await db.system.query('SELECT 1 FROM circle.questions LIMIT 1');
  if (any.rows.length) return;
  await db.system.query(
    `INSERT INTO circle.questions (prompt, poll_options, status, published_at) VALUES ($1, $2::jsonb, 'published', now())`,
    ['What is one small thing you did for your health this week?', JSON.stringify(['Ate better', 'Moved more', 'Slept better', 'Took time to rest'])]);
}
