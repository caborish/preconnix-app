import { test } from 'node:test';
import assert from 'node:assert/strict';
import { AssessmentValidationError, score, validateSubmission } from '../src/index.ts';
import { def, policy, submission } from './helpers.ts';

const p2Ids = def.sections.find(s => s.id === 'P2Q')!.questions.map(q => q.id);
const allTwos = (ids: string[]) => Object.fromEntries(ids.map(q => [q, 2]));
const wellness = () => submission({ plan: 'no', everpreg: 'no', age: '20-34' }, allTwos(p2Ids));

const codes = (s: ReturnType<typeof wellness>) => validateSubmission(def, s).issues.map(i => `${i.code}:${i.ref}`);

test('a complete wellness submission is valid', () => {
  assert.deepEqual(codes(wellness()), []);
});

test('missing answer is reported by question id', () => {
  const s = wellness();
  delete s.answers.n7;
  assert.deepEqual(codes(s), ['missing_answer:n7']);
});

test('option from another question is rejected', () => {
  const s = wellness();
  s.answers.n7 = 'n8.a';
  assert.deepEqual(codes(s), ['invalid_option:n7']);
});

test('answers for sections that do not apply are rejected', () => {
  const s = wellness();
  s.answers.b10 = 'b10.a';
  assert.deepEqual(codes(s), ['question_not_applicable:b10']);
});

test('unknown questions and profile fields are rejected', () => {
  const s = wellness();
  s.answers.zz1 = 'zz1.a';
  s.profile.score = '100';
  assert.deepEqual(codes(s).sort(), ['invalid_profile_option:score', 'unknown_question:zz1']);
});

test('missing or invalid profile values are rejected', () => {
  const s = wellness();
  delete s.profile.cycle;
  s.profile.age = 'profile.age.17';
  assert.deepEqual(codes(s).sort(), ['invalid_profile_option:age', 'missing_profile:cycle']);
});

test('score() refuses invalid submissions', () => {
  const s = wellness();
  delete s.answers.n1;
  assert.throws(() => score(def, policy, s), AssessmentValidationError);
});

test('score() refuses a policy written for another definition', () => {
  assert.throws(() => score(def, { ...policy, definitionId: 'other' }, wellness()), AssessmentValidationError);
});

test('every option in the definition has points in the legacy policy, and only 0, 1 or 2', () => {
  for (const s of def.sections) for (const q of s.questions) for (const o of q.options) {
    assert.ok([0, 1, 2].includes(policy.itemPoints[o.id]), o.id);
  }
});

test('client definition can be served without any scores', () => {
  const text = JSON.stringify(def);
  assert.ok(!/"(score|points)"/.test(text));
});

test('safety flags are raised without changing the score (proposed rules)', () => {
  const p1 = def.sections.filter(s => ['P1C', 'P1D', 'P1E'].includes(s.id)).flatMap(s => s.questions.map(q => q.id));
  const base = submission({ plan: 'yes', everpreg: 'no', age: '20-34' }, allTwos(p1));
  const unsafe = submission({ plan: 'yes', everpreg: 'no', age: '20-34' }, { ...allTwos(p1), e33: 0 });
  const legacyEquivalent = submission({ plan: 'yes', everpreg: 'no', age: '20-34' }, { ...allTwos(p1), e34: 0 });
  const r = score(def, policy, unsafe);
  assert.deepEqual(score(def, policy, base).safetyFlags, []);
  assert.deepEqual(r.safetyFlags.map(f => f.code), ['relationship_safety']);
  assert.equal(r.overall.score, score(def, policy, legacyEquivalent).overall.score);
});
