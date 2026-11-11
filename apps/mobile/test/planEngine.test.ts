// The plan drafted when she taps "Generate my plan" (Dr Gloria, Review 3, 9 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { draftPlan, goalCategory, MAX_GOALS, NOT_PLANNING_RULES, PREGNANCY_RULES, PROFILE_RULES } from '../../../packages/content/src/index.ts';

const well = { pathway: 'general_wellness' as const, profile: { plan: 'no', age: '20-34', cycle: 'regular' } };

test('every goal in the rules has a real category', () => {
  for (const r of [...PREGNANCY_RULES, ...NOT_PLANNING_RULES]) for (const i of r.items) if (i.kind === 'goal') assert.ok(goalCategory(i.title), i.title);
});

test('at most 5 goals and 3 questions, and no goal twice', () => {
  const answers = Object.fromEntries(PREGNANCY_RULES.map(r => [r.question, `${r.question}.c`]));
  const d = draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'yes' }, answers });
  assert.equal(d.goals.length, MAX_GOALS);
  assert.equal(d.questions.length, 3);
  assert.equal(new Set(d.goals.map(g => g.title)).size, d.goals.length);
});

test('not planning: contraception, infections, vaccines and alcohol come first', () => {
  const answers = { n2: 'n2.b', n6: 'n6.c', n7: 'n7.b', n8: 'n8.b', n11: 'n11.b', n12: 'n12.c' };
  const d = draftPlan({ ...well, answers });
  assert.deepEqual(d.goals.slice(0, 4).map(g => g.title).sort(), ['Alcohol-free days', 'Check my vaccination record', 'Choose contraception that suits our timing', 'Get tested for infections']);
  assert.equal(d.intention, 'not_planning');
});

test('third-option answers come before second, then the lowest areas', () => {
  const answers = { c25: 'c25.b', c26: 'c26.c', c24: 'c24.b' };
  const d = draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'unsure' }, answers, areaPercent: { c25: 80, c24: 20 } });
  assert.equal(d.goals[0].title, 'Fruit or vegetables at every meal');
  assert.equal(d.goals[1].title, 'Book a dental check-up');
  assert.equal(d.intention, 'unsure');
});

test('already-doing answers start ticked and goals in her plan are not repeated', () => {
  const d = draftPlan({ ...well, answers: { n2: 'n2.a', n12: 'n12.b' }, takenTitles: ['smoke-free today'] });
  assert.deepEqual(d.alreadyDoing.map(a => a.essential), ['contraception']);
  assert.equal(d.goals.length, 0);
});

test('the missing vaccines go on the vaccine goal', () => {
  const d = draftPlan({ ...well, answers: { n7: 'n7.b' }, followUps: { n7: ['vax_hepb', 'vax_flu'] } });
  assert.equal(d.goals[0].notes, 'To ask about: Hepatitis B, Influenza');
});

test('talking to someone is monthly', () => {
  const d = draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'yes' }, answers: { e34: 'e34.c' } });
  assert.equal(d.goals[0].rhythm, 'monthly');
});

test('private support is offered separately, never as a goal', () => {
  const d = draftPlan({ ...well, answers: { n17: 'n17.c', n13: 'n13.c' } });
  assert.deepEqual([d.goals.length, d.questions.length, d.essentials.length], [0, 0, 0]);
  assert.deepEqual(d.support.map(s => s.topic).sort(), ['relationship_safety', 'substance_use']);
  assert.ok(d.support.find(s => s.topic === 'relationship_safety')!.numbers.some(n => n.number === '112'));
});

test('unprotected sex adds protection first; more than one partner adds the testing question', () => {
  const d = draftPlan({ ...well, answers: { n1a: 'n1a.a', n1b: 'n1b.b' } });
  assert.equal(d.goals[0].title, 'Use protection every time');
  assert.deepEqual(d.essentials.map(e => e.essential), ['sti_prevention']);
  assert.deepEqual(d.questions, ['How often should I be tested for infections?']);
});

test('no partner: no partner goal, and the genotype question is for her alone', () => {
  const d = draftPlan({ ...well, noPartner: true, answers: { n15: 'n15.c' } });
  assert.deepEqual(d.questions, ['Should I check my genotype?']);
  const p = draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'yes' }, noPartner: true, answers: { e44: 'e44.c' } });
  assert.equal(p.goals.length, 0);
});

test('BMI outside the healthy range adds the weight goal on both paths', () => {
  assert.equal(draftPlan({ ...well, bmiBand: 'obesity', answers: {} }).goals[0].title, 'Talk to a health worker about a healthy weight for me');
  assert.equal(draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'yes' }, bmiBand: 'overweight', answers: {} }).goals.length, 1);
  assert.equal(draftPlan({ ...well, bmiBand: 'healthy', answers: {} }).goals.length, 0);
});

test('the doctor question names the pregnancy problems she ticked', () => {
  const d = draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'yes' }, answers: { b16: 'b16.b' }, followUps: { b16: ['preeclampsia', 'gdm'] } });
  assert.ok(d.questions.includes('What are my chances of having diabetes or preeclampsia in my next pregnancy and how can I prevent it?'));
});

test('the profile adds questions by age and cycle', () => {
  assert.ok(PROFILE_RULES.length >= 2);
  const d = draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'yes', age: '40+', cycle: 'absent' }, answers: {} });
  assert.deepEqual(d.questions, ['Is there anything about my age I should plan for?', 'Why are my periods irregular and what can be done about it?']);
});

test('each priority shows the answers behind it, and a goal more answers point to comes first among equals', () => {
  const answerText = { b11: { question: 'Premature?', answer: 'Once' }, b12: { question: 'Miscarriages?', answer: 'Once' }, c24: { question: 'Teeth?', answer: 'Some issues' } };
  const d = draftPlan({ pathway: 'pregnancy_planning', profile: { plan: 'yes' }, answers: { c24: 'c24.b', b11: 'b11.b', b12: 'b12.b' }, answerText });
  assert.equal(d.goals[0].title, 'Discuss my past pregnancies with a health worker');
  assert.equal(d.goals[0].reasons.length, 2);
  assert.equal(d.goals[1].reasons[0].answer, 'Some issues');
  assert.equal(d.path, 'pregnancy');
});

test('a retake lists open goals her answers no longer call for, but never her own goals', () => {
  const d = draftPlan({ ...well, answers: { n12: 'n12.a', n11: 'n11.b' }, openTitles: ['Smoke-free today', 'Alcohol-free days', 'Read my Bible daily'], takenTitles: ['Smoke-free today', 'Alcohol-free days'] });
  assert.deepEqual(d.clearedGoals, ['Smoke-free today']);
  assert.equal(d.goals.length, 0);
});
