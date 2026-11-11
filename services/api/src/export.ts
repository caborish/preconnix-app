// Download my data (BE-16, MB-19): everything PreConnix holds for the signed-in member, in one JSON file.
// Results, answers and the plan are read through the member's own routes (same walls and decryption as the app);
// account, consent history, check-ins and Circle contributions are read directly, inside the member's own wall.
// Nothing of the content is logged; the export itself is audited. Other members appear only as their usernames.
import type { FastifyInstance } from 'fastify';
import type { Database } from './db/database.ts';
import { audit } from './http.ts';

export const EXPORT_FORMAT = 'preconnix-member-export/1';

export function registerExportRoutes(app: FastifyInstance, deps: { db: Database }) {
  const { db } = deps;

  app.get('/v1/me/export', async (req, reply) => {
    const headers = { authorization: req.headers.authorization ?? '' };
    const get = async (url: string) => {
      const r = await app.inject({ method: 'GET', url, headers });
      return r.statusCode === 200 ? r.json() : null;
    };

    const me = await get('/v1/me');
    const list: { id: string }[] = (await get('/v1/assessments'))?.items ?? [];
    const assessments = [];
    for (const a of list) {
      const detail = await get(`/v1/assessments/${a.id}`);
      assessments.push({ ...detail, result: await get(`/v1/assessments/${a.id}/result`), aiExplanation: await get(`/v1/assessments/${a.id}/explanation`) });
    }
    const plan = await get('/v1/rlp');
    const healthDetails = await get('/v1/me/health-details');

    const own = await db.asUser(req.userId!, async tx => {
      const q = async (sql: string) => (await tx.query(sql, [req.userId])).rows;
      return {
        account: (await q(`SELECT created_at AS "createdAt", eligibility_confirmed_at AS "confirmedAdultAt", welcome_email_at AS "welcomeEmailAt"
                           FROM identity.users WHERE id = $1`))[0] ?? null,
        consentHistory: await q(`SELECT purpose, granted, source, recorded_at AS "recordedAt" FROM identity.consents WHERE user_id = $1 ORDER BY recorded_at`),
        // Goal titles are encrypted; each check-in names its goal by id (see plan.goals for the titles).
        checkins: await q(`SELECT goal_id AS "goalId", to_char(day, 'YYYY-MM-DD') AS day, amount FROM phi.rlp_checkins
                           WHERE user_id = $1 ORDER BY day`),
        circle: {
          username: (await q('SELECT handle FROM identity.user_handles WHERE user_id = $1'))[0]?.handle ?? null,
          answers: await q(`SELECT q.prompt AS question, a.body AS answer, a.status, a.created_at AS "createdAt"
                            FROM phi.circle_answers a JOIN circle.questions q ON q.id = a.question_id WHERE a.user_id = $1 ORDER BY a.created_at`),
          votes: await q(`SELECT q.prompt AS question, q.poll_options -> v.option_index AS choice, v.voted_at AS "votedAt"
                          FROM phi.circle_votes v JOIN circle.questions q ON q.id = v.question_id WHERE v.user_id = $1 ORDER BY v.voted_at`),
          reportsMade: await q(`SELECT r.reason, r.created_at AS "createdAt" FROM phi.circle_reports r WHERE r.reporter_id = $1 ORDER BY r.created_at`),
          blockedUsernames: (await q(`SELECT h.handle FROM phi.circle_blocks b JOIN identity.user_handles h ON h.user_id = b.blocked_user_id
                                      WHERE b.user_id = $1`)).map(r => r.handle)
        }
      };
    });
    await db.asUser(req.userId!, tx => audit(tx, req, 'account.export', 'user', req.userId!, 'success'));

    reply.header('content-disposition', 'attachment; filename="preconnix-my-data.json"');
    reply.header('cache-control', 'no-store');
    return {
      format: EXPORT_FORMAT,
      exportedAt: new Date().toISOString(),
      notes: [
        'This file holds everything PreConnix stores for your account.',
        'Your sign-in email is held by our sign-in provider (Microsoft) and is not stored in this file.',
        'Reminders, lesson progress and saved lessons stay on your phone and are not stored by PreConnix.'
      ],
      account: own.account,
      privacy: { current: me?.consents ?? [], history: own.consentHistory },
      assessments,
      healthDetails,
      plan: plan ? { ...plan, allCheckins: own.checkins } : null,
      circle: own.circle
    };
  });
}
