// Drafts a plan from a member's latest assessment when she taps "Generate my plan". Rules only, from planRules.ts;
// no AI. Nothing here is saved: she edits the draft and accepts it. Runs on the server, where her answers are.
import { GOAL_SUGGESTIONS, type SuggestedCategory } from './goals.ts';
import { VACCINES, type PlanIntention } from './planGuide.ts';
import { supportMessage, type SupportMessage, type SupportTopic } from './support.ts';
import { MAX_GOALS, MAX_QUESTIONS, NOT_PLANNING_RULES, PREGNANCY_RULES, PROFILE_RULES, type PlanItem, type Rhythm } from './planRules.ts';

export interface PlanDraftInput {
  pathway: 'pregnancy_planning' | 'general_wellness';
  /** Plain profile values, e.g. { plan: 'no', age: '35-39' }. */
  profile: Record<string, string>;
  /** Question id → option id. */
  answers: Record<string, string>;
  followUps?: Record<string, string[]>;
  /** Question id → her percent in that question's area (lower comes first). */
  areaPercent?: Record<string, number>;
  /** No partner: partner goals are left out and partner wording changes (Review 4). */
  noPartner?: boolean;
  /** From her result, when she gave her height and weight. */
  bmiBand?: string | null;
  /** Goals already in her plan, never suggested again. */
  takenTitles?: string[];
  /** Goals still open in her plan: a retake can show that one is no longer flagged. */
  openTitles?: string[];
  /** Question id → the wording she saw and the answer she chose. */
  answerText?: Record<string, { question: string; answer: string }>;
  /** The saved assessment this draft comes from. */
  assessmentId?: string;
}

export interface DraftGoal {
  title: string; category: SuggestedCategory; rhythm: Rhythm; notes: string | null;
  /** Her own answers that put this goal in her plan (at most two). */
  reasons: { question: string; answer: string }[];
}
export interface PlanDraft {
  assessmentId: string | null;
  intention: PlanIntention;
  /** Her overall goal, which decides which rules apply. */
  path: 'pregnancy' | 'not_planning';
  goals: DraftGoal[];
  questions: string[];
  /** Essentials she already does: they start ticked. */
  alreadyDoing: { essential: string; title: string }[];
  /** Essentials to look at on her checklist. */
  essentials: { essential: string; title: string }[];
  /** Private: never on the shared plan unless she chooses. */
  support: SupportMessage[];
  /** Open goals her latest answers no longer call for. */
  clearedGoals: string[];
}

/** Categories for goals that are not among the suggestions. */
const OTHER_CATEGORIES: Record<string, SuggestedCategory> = {
  'Book a dental check-up': 'checkups_screening',
  'Keep a regular bedtime': 'lifestyle',
  'Use protection every time': 'lifestyle',
  'Talk to a health worker about a healthy weight for me': 'checkups_screening',
  'Walk at least 30 minutes five times a week with at least 2 sessions of resistance training': 'lifestyle',
  'Find out about health insurance or start saving': 'finances_housing'
};
const SUGGESTED = new Map(Object.values(GOAL_SUGGESTIONS).flat().map(g => [g.title, g.category]));
export const goalCategory = (title: string): SuggestedCategory | null => SUGGESTED.get(title) ?? OTHER_CATEGORIES[title] ?? null;

const VACCINE_GOAL = 'Check my vaccination record';
const PARTNER_GOAL = 'Talk with my partner about our plans';
const GENOTYPE_Q = 'Should my partner and I check our genotypes?';
const WEIGHT_GOAL = 'Talk to a health worker about a healthy weight for me';
const PREGNANCY_PROBLEMS_Q = 'What are my chances of having gestational hypertension, diabetes or preeclampsia in my next pregnancy and how can I prevent it?';
const PROBLEM_NAME: Record<string, string> = { ghtn: 'gestational hypertension', gdm: 'diabetes', preeclampsia: 'preeclampsia' };

/** The doctor question names the problems she ticked (Dr Gloria, Reviews 3 and 4). */
function namedProblems(ticked: string[] | undefined): string {
  const names = Object.keys(PROBLEM_NAME).filter(t => ticked?.includes(t)).map(t => PROBLEM_NAME[t]);
  if (!names.length) return PREGNANCY_PROBLEMS_Q;
  const list = names.length > 1 ? `${names.slice(0, -1).join(', ')} or ${names[names.length - 1]}` : names[0];
  return `What are my chances of having ${list} in my next pregnancy and how can I prevent it?`;
}

function intentionOf(input: PlanDraftInput): PlanIntention {
  if (input.pathway === 'general_wellness') return 'not_planning';
  return input.profile.plan === 'unsure' ? 'unsure' : 'planning_now';
}

interface Hit { items: PlanItem[]; first: boolean; option: 'a' | 'b' | 'c'; percent: number; order: number; question?: string; support?: number }

export function draftPlan(input: PlanDraftInput): PlanDraft {
  const rules = input.pathway === 'general_wellness' ? NOT_PLANNING_RULES : PREGNANCY_RULES;
  const hits: Hit[] = [];
  rules.forEach((rule, order) => {
    const answer = input.answers[rule.question];
    const option = answer?.slice(answer.lastIndexOf('.') + 1) as 'a' | 'b' | 'c' | undefined;
    if (option && rule.when.includes(option)) {
      hits.push({ items: rule.items, first: !!rule.first, option, percent: input.areaPercent?.[rule.question] ?? 100, order, question: rule.question });
    }
  });
  // Profile rules count as second-option answers.
  PROFILE_RULES.forEach((rule, i) => {
    if (rule.values.includes(input.profile[rule.field])) hits.push({ items: rule.items, first: false, option: 'b', percent: 100, order: rules.length + i });
  });
  if (input.bmiBand && input.bmiBand !== 'healthy') {
    hits.push({ items: [{ kind: 'goal', title: WEIGHT_GOAL, rhythm: 'once' }], first: false, option: input.bmiBand === 'overweight' ? 'b' : 'c', percent: 100, order: rules.length + PROFILE_RULES.length });
  }
  // Dr Gloria's order: items marked first, then third-option answers before second-option, then her lowest areas.
  // These are her top risks: one goal for each, five at most. A goal several answers point to comes first among equals.
  const weight = (o: Hit['option']) => (o === 'c' ? 0 : o === 'b' ? 1 : 2);
  const goalOf = (h: Hit) => h.items.find((i): i is Extract<PlanItem, { kind: 'goal' }> => i.kind === 'goal')?.title;
  const backing = new Map<string, number>();
  for (const h of hits) for (const i of h.items) if (i.kind === 'goal') backing.set(i.title, (backing.get(i.title) ?? 0) + 1);
  for (const h of hits) h.support = backing.get(goalOf(h) ?? '') ?? 0;
  hits.sort((x, y) => Number(y.first) - Number(x.first) || weight(x.option) - weight(y.option) || x.percent - y.percent || y.support! - x.support! || x.order - y.order);

  /** Up to two of her answers behind this goal, the most serious first. */
  const reasonsFor = (title: string) => hits.filter(h => h.question && input.answerText?.[h.question] && h.items.some(i => i.kind === 'goal' && i.title === title))
    .slice(0, 2).map(h => input.answerText![h.question!]);

  const taken = new Set((input.takenTitles ?? []).map(t => t.toLowerCase()));
  const goals: DraftGoal[] = [];
  const questions: string[] = [];
  const alreadyDoing: PlanDraft['alreadyDoing'] = [];
  const essentials: PlanDraft['essentials'] = [];
  const topics: SupportTopic[] = [];
  const missing = [...(input.followUps?.c22 ?? []), ...(input.followUps?.n7 ?? [])];
  const missingNote = missing.length ? `To ask about: ${VACCINES.filter(v => missing.includes(v.id)).map(v => v.name).join(', ')}` : null;

  for (const { items } of hits) for (const item of items) {
    if (item.kind === 'goal') {
      if (input.noPartner && item.title === PARTNER_GOAL) continue;
      const key = item.title.toLowerCase();
      if (goals.length < MAX_GOALS && !taken.has(key) && !goals.some(g => g.title.toLowerCase() === key)) {
        goals.push({ title: item.title, category: goalCategory(item.title) ?? 'lifestyle', rhythm: item.rhythm, notes: item.title === VACCINE_GOAL ? missingNote : null, reasons: item.title === WEIGHT_GOAL && input.bmiBand ? [{ question: 'Your BMI', answer: input.bmiBand }] : reasonsFor(item.title) });
      }
    } else if (item.kind === 'ask') {
      const wording = item.question === GENOTYPE_Q && input.noPartner ? 'Should I check my genotype?' : item.question === PREGNANCY_PROBLEMS_Q ? namedProblems(input.followUps?.b16) : item.question;
      if (questions.length < MAX_QUESTIONS && !questions.includes(wording)) questions.push(wording);
    } else if (item.kind === 'done') {
      if (!alreadyDoing.some(a => a.essential === item.essential)) alreadyDoing.push({ essential: item.essential, title: item.title });
    } else if (item.kind === 'essential') {
      if (!essentials.some(a => a.essential === item.essential)) essentials.push({ essential: item.essential, title: item.title });
    }
    else if (item.kind === 'support' && !topics.includes(item.topic)) topics.push(item.topic);
  }
  const fired = new Set(hits.flatMap(h => h.items.flatMap(i => (i.kind === 'goal' ? [i.title.toLowerCase()] : []))));
  const known = new Set([...rules, ...PROFILE_RULES].flatMap(r => r.items.flatMap(i => (i.kind === 'goal' ? [i.title.toLowerCase()] : []))).concat(WEIGHT_GOAL.toLowerCase()));
  const clearedGoals = (input.openTitles ?? []).filter(t => known.has(t.toLowerCase()) && !fired.has(t.toLowerCase()));
  return {
    assessmentId: input.assessmentId ?? null, intention: intentionOf(input), path: input.pathway === 'general_wellness' ? 'not_planning' : 'pregnancy',
    goals, questions, alreadyDoing, essentials, support: topics.map(supportMessage), clearedGoals
  };
}
