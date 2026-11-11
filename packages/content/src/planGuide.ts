// The Reproductive Life Plan guide for Nigeria (owner, 4 Nov 2026: Nigeria-only; SOGC's 2026 "My Preconception
// Plan" as the benchmark: My goals · Next 3 months · My support · Questions for my provider, with a checklist in
// five groups). The wording is our own, written for Nigeria.
//
// APPROVED: the essentials, their explanations and the provider questions are clinical content, approved by
// Dr Gloria on 4 Nov 2026 (PLAN_GUIDE_APPROVAL). Clinical wording: never edit here. Changes need a new review and
// approval (CLAUDE.md guardrails). Area explanations reuse her approved guidance (guidanceText.ts).
//
// The "intelligence" is plain rules over the member's latest result: which essentials matter most for her, why,
// which goals to suggest first, and which questions to bring to her provider. No AI is needed for any of it; when
// she has an AI-assisted explanation (ADR-018), its questions are offered too.
import { GOAL_SUGGESTIONS, type GoalSuggestion } from './goals.ts';
import { GUIDANCE, levelFor, type Level } from './guidance.ts';

export const PLAN_GUIDE_APPROVAL = {
  approved: true,
  reviewedBy: 'Dr Gloria Williams-Aborishade, Co-founder – Chief Medical Officer' as string | null,
  receivedFrom: 'Owner, in chat',
  reviewedOn: '2026-11-04' as string | null
};

export type PlanIntention = 'planning_now' | 'planning_later' | 'unsure' | 'not_planning' | 'prefer_not_say';
export type EssentialGroup = 'health_care' | 'nutrition' | 'lifestyle' | 'prevention' | 'wellbeing';
/** Who an item is for: people who may want a pregnancy, people who do not, or everyone. */
type Audience = 'pregnancy' | 'not_planning' | 'all';

export interface Essential {
  id: string;
  group: EssentialGroup;
  title: string;
  /** One or two plain sentences: why it matters. */
  why: string;
  audience: Audience;
  /** Result areas that make this item more important for her. */
  domains: string[];
  /** The goal added to the plan when she chooses it. */
  goal: GoalSuggestion;
}

export const GROUP_LABEL: Record<EssentialGroup, string> = {
  health_care: 'Health care', nutrition: 'Nutrition', lifestyle: 'Lifestyle', prevention: 'Prevention', wellbeing: 'Well-being'
};

const s = GOAL_SUGGESTIONS;
const find = (domain: string, title: string) => s[domain].find(g => g.title === title)!;

export const ESSENTIALS: Essential[] = [
  { id: 'checkup', group: 'health_care', audience: 'pregnancy', domains: ['physical_medical', 'obstetric_history', 'chronic_medications'],
    title: 'See a health worker before pregnancy',
    why: 'A check-up before pregnancy is a chance to talk through your health, medicines and plans, and to start any care you need early.',
    goal: find('physical_medical', 'Book a preconception check-up') },
  { id: 'health_check', group: 'health_care', audience: 'not_planning', domains: ['physical_medical', 'chronic_medications'],
    title: 'Have a routine health check',
    why: 'A regular check-up helps you catch problems early and keep on top of any long-term condition.',
    goal: { title: 'Book a health check', category: 'checkups_screening', rhythm: 'once' } },
  { id: 'genotype', group: 'health_care', audience: 'all', domains: ['reproductive_genetic'],
    title: 'Know your genotype and blood group',
    why: 'Your genotype (such as AA, AS or SS) and blood group help a health worker plan care with you. If you plan children with a partner, their genotype matters too.',
    goal: { title: 'Know my genotype and blood group', category: 'checkups_screening', rhythm: 'once' } },
  { id: 'blood_pressure', group: 'health_care', audience: 'all', domains: ['physical_medical'],
    title: 'Know your blood pressure',
    why: 'High blood pressure often has no signs. A quick check at a clinic or pharmacy tells you where you stand.',
    goal: find('physical_medical', 'Know my blood pressure') },
  { id: 'medicines', group: 'health_care', audience: 'all', domains: ['chronic_medications'],
    title: 'Review your medicines and herbal remedies',
    why: 'Some medicines and herbal mixtures are not safe before or during pregnancy. A doctor or pharmacist can check everything you take. Keep taking prescribed medicines unless your clinician advises otherwise.',
    goal: find('chronic_medications', 'Review my medicines with a doctor or pharmacist') },

  { id: 'folic_acid', group: 'nutrition', audience: 'pregnancy', domains: ['physical_nutrition', 'physical_medical'],
    title: 'Take folic acid every day',
    why: 'A daily supplement containing 400 micrograms of folic acid is generally recommended when planning pregnancy; a healthcare professional can advise whether your circumstances require a different dose.',
    goal: find('physical_nutrition', 'Take my folic acid supplement') },
  { id: 'iron', group: 'nutrition', audience: 'all', domains: ['physical_nutrition'],
    title: 'Eat iron-rich foods and ask about anaemia',
    why: 'Low blood (anaemia) is common and can make you tired. Beans, leafy greens such as ugwu or efo, fish and liver help, and a simple blood test can check your level.',
    goal: { title: 'Iron-rich food at one meal a day', category: 'nutrition_supplements', rhythm: 'daily' } },
  { id: 'fruit_veg', group: 'nutrition', audience: 'all', domains: ['physical_nutrition'],
    title: 'Fruit or vegetables at every meal',
    why: 'Small, regular changes to what you eat are easier to keep than big ones.',
    goal: find('physical_nutrition', 'Fruit or vegetables at every meal') },

  { id: 'alcohol', group: 'lifestyle', audience: 'pregnancy', domains: ['substance_use', 'sexual_substance'],
    title: 'Cut down or stop alcohol',
    why: 'No amount of alcohol is known to be safe in pregnancy, and a pregnancy may not be noticed for some weeks.',
    goal: find('substance_use', 'Alcohol-free days') },
  { id: 'smoking', group: 'lifestyle', audience: 'all', domains: ['substance_use', 'sexual_substance'],
    title: 'Stop smoking or shisha',
    why: 'Smoke harms your heart, lungs and fertility. Every smoke-free day counts.',
    goal: find('substance_use', 'Smoke-free today') },
  { id: 'activity', group: 'lifestyle', audience: 'all', domains: ['physical_nutrition', 'physical_medical'],
    title: 'Move your body most days',
    why: 'Walking, dancing or chores that get you moving help your weight, mood and blood pressure.',
    goal: find('physical_medical', 'Walk or exercise') },

  { id: 'vaccines', group: 'prevention', audience: 'all', domains: ['infectious_immunization'],
    title: 'Check your vaccines',
    why: 'Ask a health worker which of these you still need, and bring any vaccination card you have. Tick each one you have had.',
    goal: find('infectious_immunization', 'Check my vaccination record') },
  { id: 'infection_tests', group: 'prevention', audience: 'all', domains: ['infectious_immunization', 'sexual_substance'],
    title: 'Get tested for HIV, hepatitis B and syphilis',
    why: 'These infections often have no signs and can be passed to a baby. Knowing early means they can be treated or managed.',
    goal: find('infectious_immunization', 'Get tested for infections') },
  { id: 'malaria', group: 'prevention', audience: 'pregnancy', domains: ['infectious_immunization'],
    title: 'Sleep under a treated mosquito net',
    why: 'Malaria is especially dangerous in pregnancy. An insecticide-treated net every night is one of the best protections.',
    goal: { title: 'Sleep under my mosquito net', category: 'lifestyle', rhythm: 'daily' } },
  // Not planning a pregnancy (Dr Gloria, 5 Nov 2026): protection from infections and alcohol, alongside
  // contraception, vaccines and tests. Her wording, Review 1, 9 Nov 2026.
  { id: 'sti_prevention', group: 'prevention', audience: 'not_planning', domains: ['family_planning', 'infectious_immunization', 'sexual_substance'],
    title: 'Protect yourself from infections',
    why: 'Using a condom every time and knowing your partner\u2019s status lower the risk of HIV and other sexually transmitted infections. A health worker can talk you through your options.',
    goal: { title: 'Use protection every time', category: 'lifestyle', rhythm: 'weekly' } },
  { id: 'alcohol_less', group: 'lifestyle', audience: 'not_planning', domains: ['substance_use', 'sexual_substance'],
    title: 'Cut down on alcohol',
    why: 'Alcohol intake affects the liver, sleep, mood and choices about sex. Alcohol-free days can protect your health now and later.',
    goal: find('substance_use', 'Alcohol-free days') },
  { id: 'contraception', group: 'prevention', audience: 'not_planning', domains: ['family_planning'],
    title: 'Choose family planning that fits your plans',
    why: 'If you want to delay or avoid pregnancy, a family planning clinic or health worker can help you find a method that suits you.',
    goal: find('family_planning', 'Choose contraception that suits our timing') },

  { id: 'mood', group: 'wellbeing', audience: 'all', domains: ['mental_social_env', 'mental_health_safety'],
    title: 'Check in on your mood',
    why: 'How you feel matters. If you often feel low, worried or overwhelmed, talking to someone you trust or a health worker can help.',
    goal: find('mental_social_env', 'Talk to someone I trust') },
  { id: 'costs', group: 'wellbeing', audience: 'pregnancy', domains: [],
    title: 'Plan for the cost of care',
    why: 'Health insurance through the NHIA or your state scheme can lower the cost of antenatal care and delivery. Find out what your employer or state offers.',
    goal: { title: 'Find out about health insurance', category: 'finances_housing', rhythm: 'once' } },
  { id: 'partner_talk', group: 'wellbeing', audience: 'pregnancy', domains: ['family_planning'],
    title: 'Talk with your partner about your plans',
    why: 'Sharing your hopes, timing and worries early makes the next steps easier to take together.',
    goal: find('family_planning', 'Talk with my partner about our plans') }
];

/**
 * Vaccines relevant to preconception care, ticked one by one in the plan (Dr Gloria, 5 Nov 2026). Ids are stored in
 * the plan's ticked list next to the essentials.
 */
export const VACCINES = [
  { id: 'vax_hpv', name: 'HPV', note: 'Protects against cervical cancer' },
  { id: 'vax_hepb', name: 'Hepatitis B', note: '' },
  { id: 'vax_td', name: 'Tetanus-diphtheria', note: '' },
  { id: 'vax_mmr', name: 'MMR (rubella)', note: 'Measles, mumps and rubella' },
  { id: 'vax_varicella', name: 'Chickenpox (varicella)', note: '' },
  { id: 'vax_flu', name: 'Influenza', note: 'Flu' },
  { id: 'vax_covid', name: 'COVID-19', note: '' }
] as const;
export const VACCINES_APPROVAL = { approved: true, reviewedBy: 'Dr Gloria', receivedFrom: 'Owner, in chat', reviewedOn: '2026-11-05' } as const;

/** "How do you picture your family?" Every answer is valid, including no children. */
export const FAMILY_PICTURES = {
  with_partner: 'With a partner',
  on_my_own: 'On my own',
  adopt_foster: 'Through adoption or fostering',
  no_children: "I don't want children",
  not_sure: 'Not sure yet',
  prefer_not_say: 'Prefer not to say'
} as const;
export type FamilyPicture = keyof typeof FAMILY_PICTURES;

/** "Who can support you?" Fixed choices, so nothing personal is typed. */
export const SUPPORT_OPTIONS = {
  partner: 'My partner or spouse',
  family: 'Family',
  friends: 'Friends',
  health_worker: 'A health worker',
  faith: 'My faith community',
  community: "A women's group or community",
  no_one_yet: 'No one yet'
} as const;
export type SupportOption = keyof typeof SUPPORT_OPTIONS;

/** Questions to bring to a provider, by result area (draft, with the essentials). */
const AREA_QUESTIONS: Record<string, string> = {
  physical_medical: 'What checks should I have before trying for a baby?',
  physical_nutrition: 'Which supplements are right for me, and do I need an anaemia test?',
  infectious_immunization: 'Which vaccines and tests do I need?',
  chronic_medications: 'Are my medicines and herbal remedies safe if I become pregnant?',
  reproductive_genetic: 'Should my partner and I check our genotypes?',
  family_planning: 'Which family planning method suits my plans?',
  substance_use: 'Where can I get support to cut down alcohol or smoking?',
  sexual_substance: 'Where can I get support to cut down alcohol or smoking?',
  mental_social_env: "Who can I talk to about how I've been feeling?",
  mental_health_safety: "Who can I talk to about how I've been feeling?",
  obstetric_history: 'How might my past pregnancies affect a future one?',
  demographics_timing: 'Is there anything about my age I should plan for?'
};
const FALLBACK_QUESTION = 'What is the most important thing for me to work on first?';

// ── The guide: rules over the latest result ──

export interface GuideArea { code: string; name: string; percent: number }
export interface GuideInput {
  intention: PlanIntention | null;
  /** The latest result's pathway, used when she has not said her plans. */
  pathway?: 'pregnancy_planning' | 'general_wellness' | null;
  /** Lowest-scoring areas first. */
  focus: GuideArea[];
  /** On a generated plan: only the essentials her answers called for. */
  only?: string[] | null;
}

const MAY_WANT_PREGNANCY: PlanIntention[] = ['planning_now', 'planning_later', 'unsure'];
const NOT_PLANNING_FIRST = ['contraception', 'sti_prevention', 'infection_tests', 'vaccines', 'alcohol_less', 'smoking'];

/**
 * Two paths (Dr Gloria, 5 Nov 2026): "now", "later" and "not sure" are planning a pregnancy; "no" is the reproductive
 * health path (contraception, infections, vaccines, alcohol, lifestyle). "Prefer not to say" is no longer offered;
 * an older plan with it follows her latest result.
 */
export function planPath(input: GuideInput): { pregnancy: boolean; notPlanning: boolean } {
  if (input.intention && MAY_WANT_PREGNANCY.includes(input.intention)) return { pregnancy: true, notPlanning: false };
  if (input.intention === 'not_planning') return { pregnancy: false, notPlanning: true };
  return input.pathway === 'pregnancy_planning' ? { pregnancy: true, notPlanning: false } : { pregnancy: false, notPlanning: true };
}

export interface RankedEssential extends Essential {
  /** Linked to one of her focus areas. */
  recommended: boolean;
  /** Plain reason shown under the item, e.g. "From your result: Physical & Nutritional Health (45%)". */
  reason: string | null;
}

/** The essentials for her path, the ones linked to her lowest areas first (in that order), then the rest by group. */
export function essentialsFor(input: GuideInput): RankedEssential[] {
  const path = planPath(input);
  const fits = (e: Essential) => e.audience === 'all' || (e.audience === 'pregnancy' && path.pregnancy) || (e.audience === 'not_planning' && path.notPlanning);
  // On the "not planning" path these come first, in this order, whatever her result (Dr Gloria, 5 Nov 2026).
  const first = path.pregnancy ? [] : NOT_PLANNING_FIRST;
  const rank = (e: Essential) => {
    const lead = first.indexOf(e.id);
    if (lead !== -1) return lead - first.length;
    const i = input.focus.findIndex(f => e.domains.includes(f.code));
    return i === -1 ? input.focus.length : i;
  };
  return ESSENTIALS.filter(e => fits(e) && (!input.only || input.only.includes(e.id)))
    .map((e, order) => {
      const area = input.focus.find(f => e.domains.includes(f.code));
      return { ...e, order, recommended: !!area, reason: area ? `From your result: ${area.name} (${area.percent}%)` : null };
    })
    .sort((a, b) => rank(a) - rank(b) || a.order - b.order)
    .map(({ order: _o, ...e }) => e);
}

const firstSentences = (text: string, n: number) => (text.match(/[^.!?]+[.!?]+/g) ?? [text]).slice(0, n).map(s => s.trim()).join(' ');

/** What her score in an area suggests, in Dr Gloria's approved words (first two sentences for her level). */
export function areaExplainer(area: GuideArea): { level: Level; text: string } {
  const level = levelFor(area.percent);
  const text = GUIDANCE.domain[area.code]?.[level];
  return { level, text: text ? firstSentences(text, 2) : 'Talk with your healthcare provider about this area at your next visit.' };
}

export const LEVEL_LABEL: Record<Level, string> = { strong: 'Doing well', attention: 'Needs some attention', priority: 'A priority' };

/**
 * Goals to suggest for the next three months: the essentials she has not done, recommended ones first, without
 * goals already in her plan. `preselect` are ticked for her (one per focus area first) so she can simply continue.
 */
export function suggestedGoals(input: GuideInput, done: string[], takenTitles: string[], preselect = 3) {
  const taken = new Set(takenTitles.map(t => t.toLowerCase()));
  const seen = new Set<string>();
  const list = essentialsFor(input)
    .filter(e => !done.includes(e.id) && !taken.has(e.goal.title.toLowerCase()))
    .filter(e => (seen.has(e.goal.title) ? false : (seen.add(e.goal.title), true)));
  // Tick one goal for each of her areas first (lowest first), then fill up in order.
  const ticked = new Set<string>();
  const covered = new Set<string>();
  for (const e of list) {
    const area = input.focus.find(f => e.domains.includes(f.code))?.code;
    if (ticked.size < preselect && area && !covered.has(area)) { ticked.add(e.id); covered.add(area); }
  }
  for (const e of list) if (ticked.size < preselect) ticked.add(e.id);
  return list.map(e => ({ essential: e, preselected: ticked.has(e.id) }));
}

/** Questions for her provider: the AI explanation's when she has one, then her areas', without repeats. At most 4. */
export function suggestedQuestions(focus: GuideArea[], aiQuestions: string[] = []): string[] {
  const out: string[] = [];
  for (const q of [...aiQuestions, ...focus.map(f => AREA_QUESTIONS[f.code] ?? FALLBACK_QUESTION), FALLBACK_QUESTION]) {
    if (out.length < 4 && !out.some(x => x.toLowerCase() === q.toLowerCase())) out.push(q);
  }
  return out;
}

/** Problems that would stop the guide from being approved: missing or long text, unknown areas. */
export function planGuideProblems(): string[] {
  const words = (t: string) => t.trim().split(/\s+/).length;
  const known = new Set(Object.keys(GOAL_SUGGESTIONS));
  const problems: string[] = [];
  for (const e of ESSENTIALS) {
    if (words(e.title) > 10) problems.push(`${e.id}: title too long`);
    if (words(e.why) > 45) problems.push(`${e.id}: explanation too long (${words(e.why)} words)`);
    for (const d of e.domains) if (!known.has(d)) problems.push(`${e.id}: unknown area ${d}`);
  }
  if (new Set(ESSENTIALS.map(e => e.id)).size !== ESSENTIALS.length) problems.push('duplicate ids');
  return problems;
}
