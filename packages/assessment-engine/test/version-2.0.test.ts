// rra-defs-2.0 / rra-2.0.0: Dr Gloria's settled decisions (Reviews 1 to 3, 9 Nov 2026).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { countOption, purgeForProfile, score, validateSubmission, visibleSections, type Definition, type Policy, type Submission } from '../src/index.ts';
import { readJson } from './helpers.ts';

const def = readJson<Definition>('packages/assessment-definitions/rra/rra-defs-2.0.json');
const policy = readJson<Policy>('packages/assessment-policies/rra/rra-2.0.0.json');
const old = readJson<Policy>('packages/assessment-policies/rra/rra-1.1.0.json');
const profile = (o: Record<string, string>) => Object.fromEntries(Object.entries({ age: '20-34', country: 'NG', cycle: 'regular', relationship: 'married', ...o }).map(([k, v]) => [k, `profile.${k}.${v}`]));
const values = (o: Record<string, string>) => ({ age: '20-34', country: 'NG', cycle: 'regular', relationship: 'married', ...o });
const wellness = (over: Record<string, string> = {}, everpreg = 'no'): Submission => {
  const answers: Record<string, string> = {};
  const v = values({ plan: 'no', everpreg });
  const fill = () => visibleSections(def, v, answers).flatMap(s => s.questions).forEach(q => { answers[q.id] ??= over[q.id] ?? `${q.id}.a`; });
  Object.assign(answers, over); fill(); fill(); fill();
  return { profile: profile({ plan: 'no', everpreg }), answers };
};

test('the same points for every answer on n1, n4 and e35, and no other points changed', () => {
  for (const q of ['n1', 'n4', 'e35']) for (const s of ['a', 'b', 'c']) assert.equal(policy.itemPoints[`${q}.${s}`], 2);
  const changed = Object.keys(old.itemPoints).filter(k => old.itemPoints[k] !== policy.itemPoints[k]).map(k => k.split('.')[0]);
  assert.deepEqual([...new Set(changed)].sort(), ['e35', 'n1', 'n4']);
  assert.deepEqual(policy.bands.map(b => b.min), old.bands.map(b => b.min));
});

test('n1 no longer changes the score', () => {
  const a = score(def, policy, wellness({ n1: 'n1.a' })), b = score(def, policy, wellness({ n1: 'n1.c' }));
  assert.deepEqual(a.overall, b.overall);
});

test('n3 appears only after Sometimes or Not at all to n2', () => {
  const ids = (a: Record<string, string>) => visibleSections(def, values({ plan: 'no', everpreg: 'no' }), a).flatMap(s => s.questions.map(q => q.id));
  assert.ok(!ids({ n2: 'n2.a' }).includes('n3'));
  assert.ok(ids({ n2: 'n2.b' }).includes('n3'));
  assert.ok(ids({ n2: 'n2.c' }).includes('n3'));
});

test('n14 is asked only if she has ever been pregnant', () => {
  const never = visibleSections(def, values({ plan: 'no', everpreg: 'no' })).flatMap(s => s.questions.map(q => q.id));
  const ever = visibleSections(def, values({ plan: 'no', everpreg: 'yes' })).flatMap(s => s.questions.map(q => q.id));
  assert.ok(!never.includes('n14'));
  assert.ok(ever.includes('n14'));
});

test('a question that was not asked counts neither for nor against her', () => {
  const r = score(def, policy, wellness({ n2: 'n2.a' }));
  assert.equal(r.domains.find(d => d.code === 'family_planning')!.max, 6);
  assert.equal(r.domains.find(d => d.code === 'reproductive_genetic')!.max, 2);
  assert.equal(r.scoredItemCount, 16);
});

test('an answer to a question that does not apply is refused and purged', () => {
  const s = wellness({ n2: 'n2.a' });
  assert.ok(validateSubmission(def, { ...s, answers: { ...s.answers, n3: 'n3.a' } }).issues.some(i => i.code === 'question_not_applicable'));
  const { kept, purged } = purgeForProfile(def, { ...s.answers, n2: 'n2.b', n3: 'n3.a' }, values({ plan: 'no', everpreg: 'no' }));
  assert.equal(kept.n3, 'n3.a');
  assert.deepEqual(purged, []);
  assert.deepEqual(purgeForProfile(def, { ...s.answers, n3: 'n3.a' }, values({ plan: 'no', everpreg: 'no' })).purged, ['n3']);
});

test('the vaccine list opens for Some gaps, lists the approved seven and shows on the result', () => {
  const s = wellness({ n7: 'n7.b' });
  const r = score(def, policy, { ...s, followUps: { n7: ['vax_hpv', 'vax_mmr'] } });
  assert.deepEqual(r.notes, ['Vaccines to ask about: HPV, MMR (rubella).']);
  assert.equal(def.sections.flatMap(q => q.questions).find(q => q.id === 'n7')!.followUp!.options.length, 7);
});

test('follow-ups are refused when the list is not open or the option is unknown', () => {
  const closed = wellness({ n7: 'n7.a' });
  assert.ok(validateSubmission(def, { ...closed, followUps: { n7: ['vax_hpv'] } }).issues.some(i => i.code === 'invalid_follow_up'));
  const open = wellness({ n7: 'n7.b' });
  assert.ok(validateSubmission(def, { ...open, followUps: { n7: ['nope'] } }).issues.some(i => i.code === 'invalid_follow_up'));
});

test('no section letters remain', () => { assert.ok(def.sections.every(s => s.tag === '')); });

const wellnessDomain = (r: ReturnType<typeof score>) => r.domains.find(d => d.code === 'physical_nutrition')!;

test('BMI scores 2 healthy, 1 overweight, 0 underweight or obesity, and is left out if unknown', () => {
  const at = (kg: number) => score(def, policy, { ...wellness(), numbers: { heightCm: 160, weightKg: kg } });
  assert.deepEqual([at(55).bmi, wellnessDomain(at(55)).earned], [{ value: 21.5, band: 'healthy' }, 6]);
  assert.deepEqual([at(70).bmi!.band, wellnessDomain(at(70)).earned], ['overweight', 5]);
  assert.deepEqual([at(45).bmi!.band, wellnessDomain(at(45)).earned], ['underweight', 4]);
  assert.deepEqual([at(90).bmi!.band, wellnessDomain(at(90)).earned], ['obesity', 4]);
  assert.equal(wellnessDomain(score(def, policy, wellness())).max, 4);
  assert.match(at(70).notes![0], /^Your BMI is 27\.3 \(overweight\)\. BMI is a simple estimate/);
});

test('height without weight, or an impossible value, is refused', () => {
  assert.ok(validateSubmission(def, { ...wellness(), numbers: { heightCm: 160 } }).issues.some(i => i.code === 'invalid_number'));
  assert.ok(validateSubmission(def, { ...wellness(), numbers: { heightCm: 20, weightKg: 60 } }).issues.some(i => i.code === 'invalid_number'));
});

test('pregnancy numbers keep the 1-3, 4-5, more-than-5 points and go on the report only', () => {
  const b10 = def.sections.flatMap(s => s.questions).find(q => q.id === 'b10')!;
  assert.deepEqual([3, 4, 5, 6].map(g => countOption(b10, g)), ['b10.a', 'b10.b', 'b10.b', 'b10.c']);
  assert.deepEqual(['a', 'b', 'c'].map(x => policy.itemPoints[`b10.${x}`]), [2, 1, 0]);
  const answers: Record<string, string> = {};
  const v = values({ plan: 'yes', everpreg: 'yes' });
  for (let i = 0; i < 2; i++) visibleSections(def, v, answers).flatMap(s => s.questions).forEach(q => { answers[q.id] ??= `${q.id}.a`; });
  const sub = { profile: profile({ plan: 'yes', everpreg: 'yes' }), answers, numbers: { gravida: 3, parity: 2 } };
  const r = score(def, policy, sub);
  assert.deepEqual(r.reportNotes, ['Pregnancy history: G3 P2.']);
  assert.deepEqual(r.notes, []);
  assert.ok(validateSubmission(def, { ...sub, numbers: { gravida: 2, parity: 3 } }).issues.some(i => i.code === 'invalid_number'));
  assert.ok(validateSubmission(def, { ...sub, answers: { ...answers, b10: 'b10.c' } }).issues.some(i => i.code === 'invalid_number'));
});

test('no partner: partner wording goes and n4 is not asked, but safety is still asked', () => {
  const qs = visibleSections(def, values({ plan: 'no', everpreg: 'no', relationship: 'single' }), {}).flatMap(s => s.questions);
  assert.ok(!qs.some(q => q.id === 'n4'));
  assert.ok(qs.some(q => q.id === 'n17'));
  assert.equal(qs.find(q => q.id === 'n15')!.text, 'Do you have a family history of genetic conditions, birth defects, or multiple miscarriages?');
  const preg = visibleSections(def, values({ plan: 'yes', everpreg: 'no', relationship: 'separated' }), {}).flatMap(s => s.questions);
  assert.equal(preg.find(q => q.id === 'd30')!.text, 'Do you consume alcohol?');
  assert.equal(preg.find(q => q.id === 'e33')!.text, 'Do you feel safe at home and in your relationships?');
});

test('one sexual partner follows Yes to unprotected sex, and neither is scored', () => {
  const ids = (a: Record<string, string>) => visibleSections(def, values({ plan: 'no', everpreg: 'no' }), a).flatMap(s => s.questions.map(q => q.id));
  assert.deepEqual(ids({}).slice(0, 3), ['n1', 'n1a', 'n2']);
  assert.deepEqual(ids({ n1a: 'n1a.a' }).slice(0, 4), ['n1', 'n1a', 'n1b', 'n2']);
  assert.deepEqual(score(def, policy, wellness({ n1a: 'n1a.a', n1b: 'n1b.b' })).overall, score(def, policy, wellness({ n1a: 'n1a.b' })).overall);
  assert.ok(score(def, policy, wellness({ n1a: 'n1a.a', n1b: 'n1b.b' })).reportNotes!.includes('More than one sexual partner in the past 6 months.'));
});

test('six topics on screen, scoring areas unchanged', () => {
  assert.deepEqual(def.sections.map(s => s.title).slice(0, 6), ['Your past pregnancies', 'Your health and care', 'Sexual health and habits', 'Safety and how you feel', 'Home, money and work', 'Thinking ahead']);
  const strip = (p: Policy) => JSON.stringify(p.domains.pregnancy_planning.map(d => [d.code, d.items.filter(i => i !== 'bmi')]));
  assert.equal(strip(policy), strip(old));
});

test('answers needing private support bring the right topics', () => {
  const r = score(def, policy, wellness({ n17: 'n17.c', n13: 'n13.b', n16: 'n16.c' }));
  assert.deepEqual(r.support, ['relationship_safety', 'mental_health', 'substance_use']);
});

