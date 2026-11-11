// Learn hub content rules. Runs with node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { LESSONS, lessonProblems, lessonsForBuild, localise, resourceRegion, storyRegion, type Lesson } from '../../../packages/content/src/lessons.ts';

test('there are 10 story lessons that pass the content rules', () => {
  assert.equal(LESSONS.length, 10);
  assert.deepEqual(lessonProblems(), []);
});

test('draft lessons never reach a production build', () => {
  assert.equal(lessonsForBuild(true).length, 10);
  assert.ok(lessonsForBuild(false).every(l => l.status === 'approved'));
});

test('a lesson cannot be approved without a reviewer, or without a strongest option', () => {
  const l: Lesson = { ...LESSONS[0], status: 'approved', reviewedBy: undefined, reviewedOn: undefined, options: LESSONS[0].options.map(o => ({ ...o, best: false })) };
  const problems = lessonProblems([l]);
  assert.ok(problems.some(p => p.includes('approved without reviewer')));
  assert.ok(problems.some(p => p.includes('strongest')));
});

test('titles name the topic, not a character', () => {
  const names = new Set(LESSONS.flatMap(l => [...l.story.NG, ...l.story.CA].map(s => s.split(' ')[0])));
  for (const l of LESSONS) assert.ok(!names.has(l.title.split(' ')[0]), l.title);
});

test('Nigeria-only (owner, 5 Nov 2026): everyone gets the Nigerian story and Nigerian/WHO links', () => {
  for (const c of ['CA', 'NG', 'GB', null]) {
    assert.equal(storyRegion(c), 'NG');
    assert.equal(resourceRegion(c), 'NG');
  }
  assert.ok(LESSONS.every(l => l.resources.other.every(r => r.url.startsWith('https://www.who.int/'))));
  assert.equal(localise({ NG: 'a', CA: 'b' }, 'CA'), 'b');
});

test('links go only to WHO, Nigerian and Canadian health authorities or SOGC; never the digital course', () => {
  const allowed = /^https:\/\/(www\.who\.int|www\.afro\.who\.int|health\.gov\.ng|ncdc\.gov\.ng|www\.canada\.ca|food-guide\.canada\.ca|988\.ca|www\.sexandu\.ca|www\.pregnancyinfo\.ca)(\/|$)/;
  for (const l of LESSONS) for (const r of [...l.resources.NG, ...l.resources.CA, ...l.resources.other]) assert.match(r.url, allowed, `${l.id}: ${r.url}`);
  assert.doesNotMatch(JSON.stringify(LESSONS), /ready before baby|preconnix\.com|course/i);
});

test('lessons make no privacy promises (those live in the privacy policy only)', () => {
  assert.doesNotMatch(JSON.stringify(LESSONS), /privacy|stay on (your|the) phone|we (never|don.t) (store|share|send)/i);
});

test('every topic and focus-area link points at a real lesson, and each lesson is in exactly one topic', async () => {
  const { LESSONS, TOPICS, FOCUS_LESSONS } = await import('../../../packages/content/src/index.ts');
  const ids = new Set(LESSONS.map(l => l.id));
  const inTopics = TOPICS.flatMap(t => t.lessonIds);
  for (const id of [...inTopics, ...Object.values(FOCUS_LESSONS).flat()]) assert.ok(ids.has(id), id);
  assert.equal(new Set(inTopics).size, inTopics.length, 'no lesson in two topics');
  assert.deepEqual([...ids].filter(id => !inTopics.includes(id)), [], 'every lesson has a topic');
});
