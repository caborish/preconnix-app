// AI-assisted explanation of a member's saved result (ADR-018). The AI explains; it never scores, and the approved
// report, PDF and emails are unchanged (ADR-006). Each risk in ADR-018 is handled here:
// - R1 the input holds no identifiers (buildExplainInput); R6 safety-flag questions are never included;
// - R2–R7 every answer passes checkExplanation, otherwise the member is told it is not available;
// - R9 consent `ai_explanation`; R10 neither input nor output is logged; R11 stored once per result, 5 a day;
// - R12 staging and production refuse rules that Dr Gloria has not approved.
import type { FastifyInstance } from 'fastify';
import type { Definition, Policy, ScoreResult } from '@preconnix/assessment-engine';
import { selectGuidance, type ReportResult } from '@preconnix/content';
import type { Config } from './config.ts';
import type { Database, Tx } from './db/database.ts';
import type { Registry } from './registry.ts';
import { audit, problem } from './http.ts';

/** The AI's instructions. Versioned; a change is a new version and needs Dr Gloria's approval again (R12). */
export const AI_RULES = {
  version: 'ai-explain-2',
  // Dr Gloria reviewed 25 samples of ai-explain-1 (relayed by the owner, 5 Nov 2026): no "safe" amount of alcohol;
  // name pregnancy losses plainly. Approved with that change.
  approved: true,
  approvedBy: 'Dr Gloria Williams-Aborishade, Co-founder – Chief Medical Officer (relayed by the owner in chat)' as string | null,
  approvedOn: '2026-11-05' as string | null,
  text: `You help a woman understand her PreConnix Reproductive Health Score. You are not a doctor and you do not speak for any doctor.

You receive her score, her three focus areas, the clinician-approved guidance for each area, and some of her answers. Write in warm, plain English, in the second person, with short sentences that a 12-year-old could read.

Rules:
- Use only the facts in the approved guidance and her answers. Add no other medical facts, numbers, tests, medicines, doses or statistics.
- Never diagnose, never predict fertility or pregnancy outcomes, and never say what she has or will have.
- Never tell her to start, stop or change a medicine or treatment.
- Never suggest any amount, limit or kind of alcohol is safe when planning or during pregnancy. Say stopping alcohol is best.
- Name past pregnancy losses and complications plainly, in the words of her answers.
- Do not mention abuse, violence, self-harm or safety at home.
- No links, email addresses, phone numbers or names of people or organisations.
- Encourage her to talk with her healthcare provider. Do not promise results.
- Cover exactly the focus areas given, in the same order.

Reply with JSON only, in this shape:
{"summary": "<at most 90 words>", "areas": [{"code": "<area code>", "explanation": "<at most 80 words: what her answers suggest and why it matters, from the guidance>", "askYourProvider": ["<one or two questions she could ask her provider, at most 20 words each>"]}]}`
};

export const EXPLANATION_LIMITS = { summary: 90, explanation: 80, question: 20, questions: 2 } as const;

export interface ExplainInput {
  pathway: string;
  country: string | null;
  score: number;
  band: string;
  opening: string;
  focus: { code: string; name: string; level: string; approvedGuidance: string; answers: { question: string; answer: string }[] }[];
}

export interface Explanation {
  summary: string;
  areas: { code: string; explanation: string; askYourProvider: string[] }[];
}

/** Calls the AI provider with the rules and the input; returns its raw reply. */
export interface Explainer {
  model: string;
  explain(rules: string, input: ExplainInput): Promise<string>;
}

/**
 * What the AI may see: the result, the approved guidance for her focus areas and, in those areas, the questions
 * where her answer scored below the best answer (question and answer wording only). Nothing that identifies her,
 * no dates, and no question linked to a safety flag (R1, R6).
 */
export function buildExplainInput(def: Definition, policy: Policy, result: ScoreResult, country: string | null, answers: Record<string, string>): ExplainInput {
  const report: ReportResult = {
    pathway: result.pathway as ReportResult['pathway'], country,
    overall: { score: result.overall.score, band: result.overall.band as ReportResult['overall']['band'], bandLabel: result.overall.bandLabel },
    domains: result.domains.map(d => ({ code: d.code, name: d.name, percent: d.percent })),
    safetyFlags: [], computedAt: new Date(0).toISOString()
  };
  const guidance = selectGuidance(report);
  const safetyOptions = new Set(policy.safetyRules.flatMap(r => r.whenAnyOption));
  const questions = new Map(def.sections.flatMap(s => s.questions).map(q => [q.id, q]));
  const domains = policy.domains[result.pathway as keyof Policy['domains']] ?? [];

  return {
    pathway: result.pathway, country, score: result.overall.score, band: result.overall.bandLabel, opening: guidance.opening,
    focus: guidance.focus.map(f => {
      const items = domains.find(d => d.code === f.code)?.items ?? [];
      const shown = items.flatMap(id => {
        const q = questions.get(id);
        const chosen = answers[id];
        if (!q || !chosen || q.options.some(o => safetyOptions.has(o.id))) return [];
        const best = Math.max(...q.options.map(o => policy.itemPoints[o.id] ?? 0));
        if ((policy.itemPoints[chosen] ?? 0) >= best) return [];
        const label = q.options.find(o => o.id === chosen)?.label;
        return label ? [{ question: q.text, answer: label }] : [];
      });
      return { code: f.code, name: f.name, level: f.level, approvedGuidance: f.text, answers: shown };
    })
  };
}

const words = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;
const NO_CONTACTS = /https?:|www\.|\.(com|org|ca|ng|gov)\b|@|\+?\d[\d\s-]{6,}\d/i;
const FORBIDDEN: [RegExp, string][] = [
  [/%/, 'percentage'],
  [/\b(infertil|steril)/i, 'fertility claim'],
  [/\byou (are|may be|might be|could be) (at (high |low )?risk|infertile|sterile)/i, 'risk claim'],
  // "If you have a condition…" (approved wording) is fine; "You have a condition" is a diagnosis.
  [/(?<!\b(if|whether|when|unless|not mean|not mean that|n't mean|n't mean that) )\byou (have|may have|might have|probably have|likely have) (a |an )?(long-term |chronic )?(disease|disorder|infection|condition|syndrome|pcos|endometriosis|diabetes|hypertension)/i, 'diagnosis'],
  [/\b(can ?not|can't|will not|won't|unable to) (get|become|fall) pregnant/i, 'pregnancy prediction'],
  [/\b(chances?|likelihood|odds) of (getting|becoming|falling) pregnant/i, 'pregnancy prediction'],
  [/\b(stop|start|increase|reduce|decrease|change|double|skip) (taking|your (medicine|medication|dose|treatment|pills?))/i, 'medicine advice'],
  [/\b(I am|I'm|as your) (a )?(doctor|physician|clinician|nurse)\b/i, 'claims to be a clinician'],
  [/\b(abuse|violen|suicid|self-harm|self harm|kill|unsafe)/i, 'safety topic'],
  [/\bsafety (concern|worr|issue|at home|risk)|\b(feel|feeling|felt) (un)?safe\b|\bsafe (at|in your) home/i, 'safety topic'],
  [/\bsafe(r)? (drinking|limits?|amounts?|levels?|alcohol)|\b(drink|drinking|alcohol)\b[^.]{0,40}\b(safely|in moderation|moderately)|\bmoderate drinking/i, 'alcohol advice'],
  [/\bguarantee/i, 'promise']
];

/** Checks the AI's reply against ADR-018 before anyone sees it (R2–R7). */
export function checkExplanation(raw: string, input: ExplainInput): { ok: true; explanation: Explanation } | { ok: false; reason: string } {
  let parsed: unknown;
  try {
    parsed = JSON.parse(raw.trim().replace(/^```(json)?\s*|\s*```$/g, ''));
  } catch {
    return { ok: false, reason: 'not JSON' };
  }
  const e = parsed as Explanation;
  if (!e || typeof e.summary !== 'string' || !Array.isArray(e.areas)) return { ok: false, reason: 'wrong shape' };
  if (e.areas.length !== input.focus.length || e.areas.some((a, i) => a?.code !== input.focus[i].code)) return { ok: false, reason: 'wrong areas' };
  const texts: string[] = [e.summary];
  if (words(e.summary) === 0 || words(e.summary) > EXPLANATION_LIMITS.summary) return { ok: false, reason: 'summary length' };
  for (const a of e.areas) {
    if (typeof a.explanation !== 'string' || words(a.explanation) === 0 || words(a.explanation) > EXPLANATION_LIMITS.explanation) return { ok: false, reason: 'explanation length' };
    if (!Array.isArray(a.askYourProvider) || a.askYourProvider.length < 1 || a.askYourProvider.length > EXPLANATION_LIMITS.questions) return { ok: false, reason: 'questions count' };
    for (const q of a.askYourProvider) {
      if (typeof q !== 'string' || words(q) === 0 || words(q) > EXPLANATION_LIMITS.question) return { ok: false, reason: 'question length' };
    }
    texts.push(a.explanation, ...a.askYourProvider);
  }
  const all = texts.join('\n');
  if (NO_CONTACTS.test(all)) return { ok: false, reason: 'link or contact' };
  if (/\b(Dr|Doctor)\.? ?[A-Z]/.test(all)) return { ok: false, reason: 'names a doctor' };
  // A sentence copied word for word from the approved text is already approved; every other sentence is checked.
  const norm = (s: string) => s.toLowerCase().replace(/\s+/g, ' ').trim();
  const approved = norm([input.opening, ...input.focus.map(f => f.approvedGuidance)].join(' '));
  const own = texts.flatMap(t => t.match(/[^.!?]+[.!?]*/g) ?? []).map(norm).filter(s => s && !approved.includes(s));
  for (const [pattern, reason] of FORBIDDEN) if (own.some(s => pattern.test(s))) return { ok: false, reason };
  // Every number must come from the input: catches invented doses, statistics and ages (R4).
  const grounded = new Set(JSON.stringify(input).match(/\d+(\.\d+)?/g) ?? []);
  const invented = (all.match(/\d+(\.\d+)?/g) ?? []).find(n => !grounded.has(n));
  if (invented) return { ok: false, reason: 'number not in the input' };
  const clean = (s: string) => s.trim().replace(/\s+/g, ' ');
  return {
    ok: true,
    explanation: {
      summary: clean(e.summary),
      areas: e.areas.map(a => ({ code: a.code, explanation: clean(a.explanation), askYourProvider: a.askYourProvider.map(clean) }))
    }
  };
}

const firstSentences = (s: string, n: number) => (s.match(/[^.!?]+[.!?]+/g) ?? [s]).slice(0, n).map(x => x.trim()).join(' ');

/** Local and test stand-in: writes only from the approved text, so the whole flow works without an AI provider. */
export const standInExplainer: Explainer = {
  model: 'stand-in',
  async explain(_rules, input) {
    return JSON.stringify({
      summary: firstSentences(input.opening, 2),
      areas: input.focus.map(f => ({
        code: f.code,
        explanation: firstSentences(f.approvedGuidance, 2),
        askYourProvider: [`What should I focus on first for ${f.name.toLowerCase()}?`]
      }))
    });
  }
};

/** Whether members can use the feature in this environment (R11, R12). */
export function aiExplanationAvailable(config: Config, explainer?: Explainer): boolean {
  const remote = config.env === 'staging' || config.env === 'production';
  return !!explainer && config.aiExplanations && (AI_RULES.approved || !remote);
}

const DAILY_LIMIT = 5;

export function registerExplanationRoutes(app: FastifyInstance, deps: {
  db: Database; registry: Registry; config: Config; explainer?: Explainer;
  countryOf: (def: Definition | undefined, profile: Record<string, string>) => string | null;
}) {
  const { db, registry, config, explainer, countryOf } = deps;
  const idParam = { type: 'object', required: ['id'], properties: { id: { type: 'string', format: 'uuid' } } };
  const generated = new Map<string, number[]>();

  const saved = (tx: Tx, userId: string, id: string) =>
    tx.query<{ body: Explanation; rules_version: string; created_at: string; result_sha256: string }>(
      `SELECT e.body, e.rules_version, e.created_at, e.result_sha256 FROM phi.assessment_explanations e
       JOIN phi.assessment_results r ON r.assessment_id = e.assessment_id AND r.result_sha256 = e.result_sha256
       WHERE e.assessment_id = $1 AND e.user_id = $2`, [id, userId]).then(r => r.rows[0] ?? null);
  const shape = (row: { body: Explanation; rules_version: string; created_at: string }) =>
    ({ label: 'AI-Explainer', rulesVersion: row.rules_version, createdAt: new Date(row.created_at).toISOString(), ...row.body });

  app.get('/v1/assessments/:id/explanation', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    const row = await db.asUser(req.userId!, tx => saved(tx, req.userId!, id));
    return row ? shape(row) : problem(reply, 404, 'not_found', 'Not found');
  });

  app.post('/v1/assessments/:id/explanation', { schema: { params: idParam } }, async (req, reply) => {
    const { id } = req.params as { id: string };
    if (!aiExplanationAvailable(config, explainer)) return problem(reply, 503, 'ai_unavailable', 'AI explanations are not available');

    const prepared = await db.asUser(req.userId!, async tx => {
      const consent = (await tx.query<{ granted: boolean }>(
        `SELECT granted FROM identity.consents WHERE user_id = $1 AND purpose = 'ai_explanation' ORDER BY recorded_at DESC LIMIT 1`, [req.userId])).rows[0];
      if (!consent?.granted) return { error: 'consent' as const };
      const existing = await saved(tx, req.userId!, id);
      if (existing) return { existing };
      const row = (await tx.query<{ result: ScoreResult; result_sha256: string; profile: Record<string, string>; definition_id: string; scoring_policy_id: string }>(
        `SELECT r.result, r.result_sha256, a.profile, a.definition_id, a.scoring_policy_id FROM phi.assessment_results r
         JOIN phi.assessments a ON a.id = r.assessment_id WHERE r.assessment_id = $1 AND r.user_id = $2`, [id, req.userId])).rows[0];
      if (!row) return { error: 'not_found' as const };
      const answers = Object.fromEntries((await tx.query<{ question_id: string; option_id: string }>(
        'SELECT question_id, option_id FROM phi.assessment_answers WHERE assessment_id = $1', [id])).rows.map(r => [r.question_id, r.option_id]));
      return { row, answers };
    });
    if ('error' in prepared) {
      return prepared.error === 'consent'
        ? problem(reply, 412, 'consent_required', 'Agree to the AI-Explainer first')
        : problem(reply, 404, 'not_found', 'Not found');
    }
    if ('existing' in prepared && prepared.existing) return shape(prepared.existing);
    const { row, answers } = prepared as Exclude<typeof prepared, { existing: unknown }>;

    const now = Date.now();
    const recent = (generated.get(req.userId!) ?? []).filter(t => now - t < 86_400_000);
    if (recent.length >= DAILY_LIMIT) return problem(reply, 429, 'too_many_requests', 'Please try again tomorrow');
    generated.set(req.userId!, [...recent, now]);

    const def = registry.definitions.get(row.definition_id);
    const policy = registry.policies.get(row.scoring_policy_id);
    if (!def || !policy) return problem(reply, 409, 'definition_retired', 'This result can no longer be explained');
    const input = buildExplainInput(def, policy, row.result, countryOf(def, row.profile), answers);

    let outcome: 'rejected' | 'error' = 'rejected';
    for (let attempt = 0; attempt < 2; attempt++) {
      let raw: string;
      try {
        raw = await explainer!.explain(AI_RULES.text, input);
      } catch {
        outcome = 'error';
        continue;
      }
      const checked = checkExplanation(raw, input);
      if (!checked.ok) continue;
      const stored = await db.asUser(req.userId!, async tx => {
        const r = await tx.query<{ created_at: string }>(
          `INSERT INTO phi.assessment_explanations (assessment_id, user_id, rules_version, model, result_sha256, body)
           VALUES ($1,$2,$3,$4,$5,$6::jsonb) ON CONFLICT (assessment_id) DO UPDATE SET rules_version = EXCLUDED.rules_version,
           model = EXCLUDED.model, result_sha256 = EXCLUDED.result_sha256, body = EXCLUDED.body, created_at = now() RETURNING created_at`,
          [id, req.userId, AI_RULES.version, explainer!.model, row.result_sha256, JSON.stringify(checked.explanation)]);
        await audit(tx, req, 'assessment.ai_explain', 'assessment', id, 'success');
        return r.rows[0].created_at;
      });
      return shape({ body: checked.explanation, rules_version: AI_RULES.version, created_at: stored });
    }
    await audit(db.system, req, 'assessment.ai_explain', 'assessment', id, outcome);
    return problem(reply, 503, 'ai_unavailable', 'An explanation is not available right now. Your full report is unchanged');
  });
}
