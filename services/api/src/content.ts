// Content staff manage in the admin console: Learn lessons and app settings (booking link, reminder suggestions).
// Lessons are clinical education: content editors draft them, and only a clinical reviewer can approve one
// (never their own edit). Members only ever see the last approved copy. No personal data here.
import type { FastifyInstance } from 'fastify';
import { DEFAULT_SETTINGS, LESSONS, lessonProblems, settingsProblems, type ContentSettings, type Lesson } from '@preconnix/content';
import type { Database } from './db/database.ts';
import { audit, problem, requireRole } from './http.ts';

type LessonBody = Omit<Lesson, 'id' | 'status' | 'reviewedBy' | 'reviewedOn'>;
interface LessonRow {
  id: string; position: number; working: LessonBody; status: Lesson['status']; published: LessonBody | null;
  reviewed_by: string | null; reviewed_on: string | null; updated_by: string | null; updated_at: string; review_note: string | null;
}

// Text that can differ by country version: a string, or { NG, CA }.
const localised = { anyOf: [{ type: 'string', maxLength: 1500 }, {
  type: 'object', required: ['NG', 'CA'], additionalProperties: false,
  properties: { NG: { type: 'string', maxLength: 1500 }, CA: { type: 'string', maxLength: 1500 } } }] };
const storyCards = { type: 'array', minItems: 3, maxItems: 7, items: { type: 'string', minLength: 1, maxLength: 400 } };
const resources = { type: 'array', minItems: 1, maxItems: 6, items: {
  type: 'object', required: ['label', 'url'], additionalProperties: false,
  properties: { label: { type: 'string', minLength: 1, maxLength: 120 }, url: { type: 'string', pattern: '^https://', maxLength: 300 } } } };
const lessonBodySchema = {
  type: 'object', required: ['title', 'summary', 'minutes', 'story', 'question', 'options', 'takeaway', 'resources'], additionalProperties: false,
  properties: {
    title: { type: 'string', minLength: 3, maxLength: 80 },
    summary: { type: 'string', minLength: 3, maxLength: 200 },
    minutes: { type: 'integer', minimum: 1, maximum: 10 },
    story: { type: 'object', required: ['NG', 'CA'], additionalProperties: false, properties: { NG: storyCards, CA: storyCards } },
    question: localised,
    options: { type: 'array', minItems: 2, maxItems: 4, items: {
      type: 'object', required: ['label', 'explanation'], additionalProperties: false,
      properties: { label: localised, explanation: localised, best: { type: 'boolean' } } } },
    takeaway: { type: 'string', minLength: 3, maxLength: 600 },
    resources: { type: 'object', required: ['NG', 'CA', 'other'], additionalProperties: false, properties: { NG: resources, CA: resources, other: resources } },
    offerConsultation: { type: 'boolean' }
  }
};
const settingsSchema = {
  type: 'object', required: ['consultationUrl', 'consultationCountries', 'reminderSuggestions'], additionalProperties: false,
  properties: {
    consultationUrl: { type: 'string', maxLength: 300 },
    consultationCountries: { type: 'array', maxItems: 10, uniqueItems: true, items: { type: 'string', maxLength: 2 } },
    reminderSuggestions: { type: 'array', maxItems: 10, items: { type: 'string', maxLength: 80 } }
  }
};
const idParams = { type: 'object', required: ['id'], properties: { id: { type: 'string', pattern: '^[a-z0-9-]{3,60}$' } } };

const day = (d: string | Date | null) => (d ? new Date(d).toISOString().slice(0, 10) : undefined);

/** A lesson as members see it: the approved copy only. */
function publishedLesson(r: LessonRow): Lesson | null {
  if (!r.published) return null;
  return { id: r.id, ...r.published, status: 'approved', reviewedBy: r.reviewed_by ?? undefined, reviewedOn: day(r.reviewed_on) };
}
/** The working copy, for staff and for draft previews in test builds. */
function workingLesson(r: LessonRow): Lesson {
  return { id: r.id, ...r.working, status: r.status, reviewedBy: r.reviewed_by ?? undefined, reviewedOn: day(r.reviewed_on) };
}

export async function loadSettings(db: Database): Promise<ContentSettings> {
  const row = (await db.system.query<{ value: ContentSettings }>(`SELECT value FROM content.settings WHERE key = 'app'`)).rows[0];
  return { ...DEFAULT_SETTINGS, ...row?.value };
}

export function registerContentRoutes(app: FastifyInstance, deps: { db: Database; allowDraftPreview: boolean }) {
  const { db } = deps;
  const allLessons = async () => (await db.system.query<LessonRow>('SELECT * FROM content.lessons ORDER BY position, id')).rows;
  const oneLesson = async (id: string) => (await db.system.query<LessonRow>('SELECT * FROM content.lessons WHERE id = $1', [id])).rows[0] ?? null;

  // ── Public: general education, the same for everyone ──
  app.get('/v1/content', {
    schema: { querystring: { type: 'object', additionalProperties: false, properties: { preview: { enum: ['drafts'] } } } }
  }, async (req, reply) => {
    const preview = (req.query as { preview?: string }).preview === 'drafts';
    if (preview && !deps.allowDraftPreview) return problem(reply, 403, 'preview_unavailable', 'Draft preview is for test builds only');
    const rows = await allLessons();
    const lessons = preview ? rows.map(workingLesson) : rows.map(publishedLesson).filter((l): l is Lesson => l !== null);
    reply.header('cache-control', preview ? 'no-store' : 'max-age=60');
    return { lessons, settings: await loadSettings(db) };
  });

  // ── Staff: who am I ──
  app.get('/admin/v1/me', async (req, reply) => {
    if (!req.roles?.length) return problem(reply, 403, 'forbidden_role', 'Staff only');
    return { roles: req.roles };
  });

  // ── Lessons ──
  app.get('/admin/v1/lessons', async (req, reply) => {
    if (!requireRole(req, reply, 'content_editor', 'clinical_reviewer')) return reply;
    return {
      items: (await allLessons()).map(r => ({
        ...workingLesson(r),
        position: r.position,
        live: r.published !== null,
        changedSinceApproval: r.published !== null && JSON.stringify(r.published) !== JSON.stringify(r.working),
        editedByMe: r.updated_by === req.userId,
        updatedAt: new Date(r.updated_at).toISOString(),
        reviewNote: r.review_note
      }))
    };
  });

  app.post('/admin/v1/lessons', {
    schema: { body: { ...lessonBodySchema, required: ['id', ...lessonBodySchema.required], properties: { id: idParams.properties.id, ...lessonBodySchema.properties } } }
  }, async (req, reply) => {
    if (!requireRole(req, reply, 'content_editor')) return reply;
    const { id, ...body } = req.body as LessonBody & { id: string };
    const r = await db.system.query(
      `INSERT INTO content.lessons (id, position, working, updated_by)
       VALUES ($1, (SELECT coalesce(max(position), 0) + 1 FROM content.lessons), $2::jsonb, $3) ON CONFLICT DO NOTHING RETURNING id`,
      [id, JSON.stringify(body), req.userId]);
    if (!r.rows.length) return problem(reply, 409, 'lesson_exists', 'A lesson with this id already exists');
    await audit(db.system, req, 'content.lesson.create', 'lesson', id, 'success', 'admin');
    return reply.code(201).send({ id });
  });

  app.put('/admin/v1/lessons/:id', { schema: { params: idParams, body: lessonBodySchema } }, async (req, reply) => {
    if (!requireRole(req, reply, 'content_editor')) return reply;
    const { id } = req.params as { id: string };
    const r = await db.system.query(
      `UPDATE content.lessons SET working = $2::jsonb, status = 'draft', updated_by = $3, updated_at = now() WHERE id = $1 RETURNING id`,
      [id, JSON.stringify(req.body), req.userId]);
    if (!r.rows.length) return problem(reply, 404, 'not_found', 'Not found');
    await audit(db.system, req, 'content.lesson.update', 'lesson', id, 'success', 'admin');
    return reply.code(204).send();
  });

  app.post('/admin/v1/lessons/:id/submit', { schema: { params: idParams } }, async (req, reply) => {
    if (!requireRole(req, reply, 'content_editor')) return reply;
    const { id } = req.params as { id: string };
    const row = await oneLesson(id);
    if (!row) return problem(reply, 404, 'not_found', 'Not found');
    if (row.status !== 'draft') return problem(reply, 409, 'not_a_draft', 'Only drafts can be sent for review');
    const problems = lessonProblems([workingLesson(row)]).map(p => p.replace(`${id}: `, ''));
    if (problems.length) return problem(reply, 422, 'lesson_incomplete', `Fix before review: ${problems[0]}`, { problems });
    await db.system.query(`UPDATE content.lessons SET status = 'in_review', review_note = NULL WHERE id = $1`, [id]);
    await audit(db.system, req, 'content.lesson.submit', 'lesson', id, 'success', 'admin');
    return reply.code(204).send();
  });

  app.post('/admin/v1/lessons/:id/review', {
    schema: { params: idParams, body: { type: 'object', required: ['decision'], additionalProperties: false, properties: {
      decision: { enum: ['approve', 'return'] },
      reviewerName: { type: 'string', minLength: 3, maxLength: 120 },
      note: { type: 'string', maxLength: 500 } } } }
  }, async (req, reply) => {
    if (!requireRole(req, reply, 'clinical_reviewer')) return reply;
    const { id } = req.params as { id: string };
    const b = req.body as { decision: 'approve' | 'return'; reviewerName?: string; note?: string };
    const row = await oneLesson(id);
    if (!row) return problem(reply, 404, 'not_found', 'Not found');
    // Drafts can be reviewed directly: lessons are written by the PreConnix team while there are no editors.
    if (row.status === 'approved') return problem(reply, 409, 'already_approved', 'This lesson is already approved');
    if (b.decision === 'approve') {
      const problems = lessonProblems([workingLesson(row)]);
      if (problems.length) return problem(reply, 422, 'lesson_incomplete', `Fix before approval: ${problems[0].replace(`${id}: `, '')}`, { problems });
    }
    if (b.decision === 'return') {
      await db.system.query(`UPDATE content.lessons SET status = 'draft', review_note = $2 WHERE id = $1`, [id, b.note?.trim() || null]);
      await audit(db.system, req, 'content.lesson.return', 'lesson', id, 'success', 'admin');
      reply.code(204);
      return null;
    }
    // Two people for every clinical change: the reviewer must not be the last editor.
    if (row.updated_by === req.userId) {
      await audit(db.system, req, 'content.lesson.approve', 'lesson', id, 'denied', 'admin');
      return problem(reply, 403, 'own_edit', 'You edited this lesson, so another clinical reviewer must approve it');
    }
    if (!b.reviewerName) return problem(reply, 422, 'reviewer_name_required', 'Add the reviewer name shown on the lesson');
    await db.system.query(
      `UPDATE content.lessons SET status = 'approved', published = working, reviewed_by = $2, reviewed_on = current_date,
         reviewer_ref = $3, review_note = NULL WHERE id = $1`, [id, b.reviewerName.trim(), req.userId]);
    await audit(db.system, req, 'content.lesson.approve', 'lesson', id, 'success', 'admin');
    return reply.code(204).send();
  });

  // ── Settings ──
  app.get('/admin/v1/settings', async (req, reply) => {
    if (!requireRole(req, reply, 'content_editor', 'clinical_reviewer', 'moderator')) return reply;
    return loadSettings(db);
  });

  app.put('/admin/v1/settings', { schema: { body: settingsSchema } }, async (req, reply) => {
    if (!requireRole(req, reply, 'content_editor')) return reply;
    const s = req.body as ContentSettings;
    const clean: ContentSettings = {
      consultationUrl: s.consultationUrl.trim(),
      consultationCountries: s.consultationCountries.map(c => c.trim().toUpperCase()),
      reminderSuggestions: s.reminderSuggestions.map(r => r.trim()).filter(Boolean)
    };
    const problems = settingsProblems(clean);
    if (problems.length) return problem(reply, 422, 'invalid_settings', problems[0], { problems });
    await db.system.query(
      `INSERT INTO content.settings (key, value, updated_by) VALUES ('app', $1::jsonb, $2)
       ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_by = EXCLUDED.updated_by, updated_at = now()`,
      [JSON.stringify(clean), req.userId]);
    await audit(db.system, req, 'content.settings.update', 'settings', 'app', 'success', 'admin');
    return clean;
  });
}

/**
 * Adds any lesson from the code that the database does not have yet. Never overwrites text. A lesson the code
 * marks approved is also approved in the database, but only while the database copy is still exactly the
 * approved text (an edit made in the admin console since then keeps its own review). Each approval is audited.
 */
export async function seedContent(db: Database, lessons: Lesson[] = LESSONS) {
  for (const [i, l] of lessons.entries()) {
    const { id: _id, status: _s, reviewedBy: _r, reviewedOn: _o, ...body } = l;
    const approved = l.status === 'approved';
    await db.system.query(
      `INSERT INTO content.lessons (id, position, working, status, published, reviewed_by, reviewed_on) VALUES ($1, $2, $3::jsonb, $4, $5::jsonb, $6, $7) ON CONFLICT (id) DO NOTHING`,
      [l.id, i + 1, JSON.stringify(body), approved ? 'approved' : 'draft', approved ? JSON.stringify(body) : null, l.reviewedBy ?? null, l.reviewedOn ?? null]);
    if (!approved) continue;
    const { rows } = await db.system.query(
      `UPDATE content.lessons SET status = 'approved', published = working, reviewed_by = $3, reviewed_on = $4, review_note = NULL
       WHERE id = $1 AND status <> 'approved' AND working = $2::jsonb RETURNING id`,
      [l.id, JSON.stringify(body), l.reviewedBy ?? null, l.reviewedOn ?? null]);
    if (rows.length) {
      await db.system.query(
        `INSERT INTO audit.events (actor_type, actor_ref, action, resource_type, resource_id, outcome) VALUES ('system', 'content-seed', 'content.lesson.approve', 'lesson', $1, 'success')`,
        [l.id]);
    }
  }
}
