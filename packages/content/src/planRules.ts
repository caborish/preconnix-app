// Plan rules (approved by Dr Gloria in Review 3, 9 Nov 2026): which assessment answers add which items to the plan the
// app drafts when she taps "Generate my plan". One rule per question; planEngine.ts reads this table.
// Clinical wording: changes need her approval. Support messages approved in Review 4.
// Answers are option suffixes: 'a' = first option, 'b' = second, 'c' = third.
// Sensitive answers (relationship safety, mental health, drug use) never become a goal to tick: they add a private
// support item, whose wording only Dr Gloria writes.

export const PLAN_RULES_APPROVAL = { approved: true, reviewedBy: 'Dr Gloria Williams-Aborishade' as string | null, reviewedOn: '2026-11-09' as string | null } as const;
export const MAX_QUESTIONS = 3;
export const MAX_GOALS = 5;

export type Rhythm = 'once' | 'daily' | 'weekly' | 'monthly';
export type PlanItem =
  | { kind: 'goal'; title: string; rhythm: Rhythm; draft?: true }
  | { kind: 'done'; essential: string; title: string }      // already doing: the essential starts ticked
  | { kind: 'essential'; essential: string; title: string } // shown in Health essentials, not ticked
  | { kind: 'ask'; question: string; draft?: true }          // question for her doctor
  | { kind: 'support'; topic: 'relationship_safety' | 'mental_health' | 'substance_use'; title: string };

export interface PlanRule {
  question: string;
  /** Answers that trigger the items; 'c' answers get the higher priority. */
  when: ('a' | 'b' | 'c')[];
  items: PlanItem[];
  /** Kept at the top on this path, whatever her scores (Dr Gloria: contraception and infections first). */
  first?: true;
}

const goal = (title: string, rhythm: Rhythm): PlanItem => ({ kind: 'goal', title, rhythm });
const newGoal = goal;
const done = (essential: string, title: string): PlanItem => ({ kind: 'done', essential, title });
const ess = (essential: string, title: string): PlanItem => ({ kind: 'essential', essential, title });
const ask = (question: string): PlanItem => ({ kind: 'ask', question });
const newAsk = ask;
const support = (topic: 'relationship_safety' | 'mental_health' | 'substance_use', title: string): PlanItem => ({ kind: 'support', topic, title });

const PAST = goal('Discuss my past pregnancies with a health worker', 'once');
const PAST_Q = ask('How might my past pregnancies affect a future one?');
const CHECKUP = goal('Book a preconception check-up', 'once');
const MEDS = goal('Review my medicines with a doctor or pharmacist', 'once');
const MEDS_Q = ask('Are my medicines and herbal remedies safe if I become pregnant?');
const VACCINES = goal('Check my vaccination record', 'once');
const TESTS = goal('Get tested for infections', 'once');
const FEELING_Q = ask("Who can I talk to about how I've been feeling?");
const TRUSTED = goal('Talk to someone I trust', 'monthly');
const PARTNER = goal('Talk with my partner about our plans', 'once');
const SAFETY = support('relationship_safety', 'Private: where to get help if you feel unsafe');
const MOOD = support('mental_health', 'Private: support for your mental health');
const DRUGS = support('substance_use', 'Private: confidential help with drugs or medicines');

/** Pregnancy path: "now", "later" and "not sure" (sections B to E). */
export const PREGNANCY_RULES: PlanRule[] = [
  { question: 'b10', when: ['b', 'c'], items: [PAST, PAST_Q, ask('What are the risks associated with an increased number of pregnancies?')] },
  { question: 'b11', when: ['b', 'c'], items: [PAST, ask('How might a past premature birth affect a future one?')] },
  { question: 'b12', when: ['b'], items: [PAST, ask('What are my chances of getting pregnant after a miscarriage?')] },
  { question: 'b12', when: ['c'], items: [PAST, ask('Why do I have recurrent miscarriages and what can be done about it?')] },
  { question: 'b13', when: [], items: [] },
  { question: 'b14', when: ['b', 'c'], items: [PAST, ask('What are the things that could have caused a stillbirth? Was it my fault?')] },
  { question: 'b15', when: ['b', 'c'], items: [PAST, ask('What are the causes of birth defects? We don\u2019t have that in my family?')] },
  { question: 'b16', when: ['b', 'c'], items: [PAST, goal('Know my blood pressure', 'once'), ask('What are my chances of having gestational hypertension, diabetes or preeclampsia in my next pregnancy and how can I prevent it?')] },
  { question: 'b17', when: ['c'], items: [newAsk('When is a good time for my next pregnancy?')] },
  { question: 'b18', when: ['b', 'c'], items: [PAST, PAST_Q] },

  { question: 'c19', when: ['b', 'c'], items: [CHECKUP] },
  { question: 'c20', when: ['a'], items: [done('checkup', 'See a health worker before pregnancy')] },
  { question: 'c20', when: ['b', 'c'], items: [CHECKUP, ask('What checks should I have before trying for a baby?')] },
  { question: 'c21', when: ['a'], items: [done('folic_acid', 'Take folic acid every day')] },
  { question: 'c21', when: ['b', 'c'], items: [goal('Take my folic acid supplement', 'daily')] },
  { question: 'c22', when: ['a'], items: [done('vaccines', 'Check your vaccines')] },
  { question: 'c22', when: ['b', 'c'], items: [VACCINES, ess('vaccines', 'Check your vaccines'), ask('Which vaccines and tests do I need?')] },
  { question: 'c23', when: ['c'], items: [MEDS, MEDS_Q] }, // c is now "Somewhat controlled" (Review 4)
  { question: 'c24', when: ['b', 'c'], items: [newGoal('Book a dental check-up', 'once')] },
  { question: 'c25', when: ['b', 'c'], items: [goal('Walk at least 30 minutes five times a week with at least 2 sessions of resistance training', 'weekly')] },
  { question: 'c26', when: ['b', 'c'], items: [goal('Fruit or vegetables at every meal', 'daily')] },
  { question: 'c27', when: ['a'], items: [done('medicines', 'Review your medicines and herbal remedies')] },
  { question: 'c27', when: ['b', 'c'], items: [MEDS, ask('Are my medicines and herbal remedies safe for my overall health?')] },

  { question: 'd28', when: ['a'], items: [done('infection_tests', 'Get tested for HIV, hepatitis B and syphilis')] },
  { question: 'd28', when: ['b', 'c'], items: [TESTS] },
  { question: 'd29', when: ['a'], items: [done('smoking', 'Stop smoking or shisha')] },
  { question: 'd29', when: ['b', 'c'], items: [goal('Smoke-free today', 'daily')] },
  { question: 'd30', when: ['a'], items: [done('alcohol', 'Cut down or stop alcohol')] },
  { question: 'd30', when: ['b', 'c'], items: [goal('Alcohol-free days', 'weekly')] },
  { question: 'd31', when: ['b', 'c'], items: [DRUGS] },
  { question: 'd32', when: ['b', 'c'], items: [goal('Read the lesson on preconception health', 'once'), ask('Is there anything about my age I should plan for?')] },

  { question: 'e33', when: ['b', 'c'], items: [SAFETY] },
  { question: 'e34', when: ['c'], items: [TRUSTED] },
  { question: 'e35', when: ['b', 'c'], items: [TRUSTED, MOOD] },
  { question: 'e36', when: ['b'], items: [FEELING_Q, MOOD] },
  { question: 'e36', when: ['c'], items: [MOOD, FEELING_Q] },
  { question: 'e37', when: ['b', 'c'], items: [newGoal('Keep a regular bedtime', 'daily')] },
  { question: 'e38', when: ['b', 'c'], items: [TRUSTED] },
  { question: 'e39', when: [], items: [] },
  { question: 'e40', when: ['b', 'c'], items: [goal('Find out about health insurance or start saving', 'once')] },
  { question: 'e41', when: ['b', 'c'], items: [newAsk('Is anything at my work or home unsafe for a pregnancy?')] },
  { question: 'e42', when: [], items: [] },
  { question: 'e43', when: ['b', 'c'], items: [FEELING_Q, MOOD] },
  { question: 'e44', when: ['b', 'c'], items: [PARTNER] },
  { question: 'e45', when: [], items: [] }
];

/** Not planning a pregnancy ("no"): the wellness questions n1 to n18. */
export const NOT_PLANNING_RULES: PlanRule[] = [
  { question: 'n1', when: [], items: [] },
  { question: 'n1a', when: ['a'], items: [ess('sti_prevention', 'Protect yourself from infections'), goal('Use protection every time', 'weekly')], first: true },
  { question: 'n1b', when: ['b'], items: [ask('How often should I be tested for infections?')] },
  { question: 'n2', when: ['a'], items: [done('contraception', 'Choose family planning that fits your plans')] },
  { question: 'n2', when: ['b', 'c'], items: [goal('Choose contraception that suits our timing', 'once'), ask('Which family planning method suits my plans?')], first: true },
  { question: 'n3', when: ['b', 'c'], items: [ask('Which family planning method suits my plans?')], first: true },
  { question: 'n4', when: ['b', 'c'], items: [PARTNER] },
  { question: 'n5', when: ['b', 'c'], items: [goal('Take my folic acid supplement', 'daily')] },
  { question: 'n6', when: ['b', 'c'], items: [goal('Fruit or vegetables at every meal', 'daily')] },
  { question: 'n7', when: ['a'], items: [done('vaccines', 'Check your vaccines')] },
  { question: 'n7', when: ['b', 'c'], items: [VACCINES, ess('vaccines', 'Check your vaccines')], first: true },
  { question: 'n8', when: ['a'], items: [done('infection_tests', 'Get tested for HIV, hepatitis B and syphilis')] },
  { question: 'n8', when: ['b', 'c'], items: [TESTS, ess('sti_prevention', 'Protect yourself from infections')], first: true },
  { question: 'n9', when: ['b', 'c'], items: [MEDS, ask('Are my medicines and herbal remedies safe for my reproductive health?')] },
  { question: 'n10', when: ['b', 'c'], items: [MEDS] },
  { question: 'n11', when: ['a'], items: [done('alcohol_less', 'Cut down on alcohol')] },
  { question: 'n11', when: ['b', 'c'], items: [goal('Alcohol-free days', 'weekly')], first: true },
  { question: 'n12', when: ['a'], items: [done('smoking', 'Stop smoking or shisha')] },
  { question: 'n12', when: ['b', 'c'], items: [goal('Smoke-free today', 'daily')] },
  { question: 'n13', when: ['b', 'c'], items: [DRUGS] },
  { question: 'n14', when: ['b', 'c'], items: [PAST] },
  { question: 'n15', when: ['b', 'c'], items: [goal('Ask my family about health conditions that run in it', 'once'), ask('Should my partner and I check our genotypes?')] },
  { question: 'n16', when: ['b', 'c'], items: [FEELING_Q, MOOD] },
  { question: 'n17', when: ['b', 'c'], items: [SAFETY] },
  { question: 'n18', when: ['c'], items: [TRUSTED, MOOD] }
];

/** From the "About you" answers. */
export const PROFILE_RULES: { field: string; values: string[]; items: PlanItem[]; label: string }[] = [
  { field: 'age', values: ['35-39', '40+'], label: 'Age 35 or older', items: [ask('Is there anything about my age I should plan for?')] },
  { field: 'cycle', values: ['irregular', 'absent'], label: 'Periods irregular, absent or very infrequent', items: [ask('Why are my periods irregular and what can be done about it?')] }
];
