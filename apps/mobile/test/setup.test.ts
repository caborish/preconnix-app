// Plan set-up: priority choices and the three-priority limit. Runs with node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { generalChoices, goalChoices, offersFromAreas, priorityOptions, startingAreas, togglePriority, toggleSupport } from '../src/features/plan/setup.ts';

test('focus areas come first, each suggestion appears once, and goals already in the plan are marked', () => {
  const opts = priorityOptions(['physical_nutrition', 'substance_use'], ['Take my folic acid supplement']);
  assert.deepEqual(opts.slice(0, 3).map(o => o.key), ['Take my folic acid supplement', 'Fruit or vegetables at every meal', 'Walk or exercise']);
  assert.equal(opts[0].inPlan, true);
  assert.equal(opts[3].key, 'Alcohol-free days');
  assert.equal(new Set(opts.map(o => o.key)).size, opts.length, 'no repeats');
});

test('without a result every suggestion is offered', () => {
  assert.ok(priorityOptions([], []).length >= 15);
});

test('up to three priorities; a fourth is refused until one is removed', () => {
  let s = togglePriority([], 'a').selected;
  s = togglePriority(s, 'b').selected;
  s = togglePriority(s, 'c').selected;
  assert.deepEqual(togglePriority(s, 'd'), { selected: ['a', 'b', 'c'], refused: true });
  s = togglePriority(s, 'b').selected;
  assert.deepEqual(togglePriority(s, 'd'), { selected: ['a', 'c', 'd'], refused: false });
});

test('the walk-through starts from the three lowest-scoring focus areas', () => {
  const focus = [{ code: 'a', percent: 60 }, { code: 'b', percent: 20 }, { code: 'c', percent: 40 }, { code: 'd', percent: 10 }];
  assert.deepEqual(startingAreas(focus), ['d', 'b', 'c']);
});

test('goal choices leave out goals already in the plan or picked for another area', () => {
  const titles = goalChoices('physical_nutrition', ['take my folic acid supplement', 'Walk or exercise']).map(s => s.title);
  assert.deepEqual(titles, ['Fruit or vegetables at every meal']);
  assert.deepEqual(goalChoices('unknown_area', []), []);
});

test('without a result, general choices list each suggestion once', () => {
  const all = generalChoices(['Alcohol-free days']).map(s => s.title);
  assert.equal(new Set(all).size, all.length);
  assert.ok(!all.includes('Alcohol-free days'));
});

test('without the guide, each focus area offers its first approved goal ticked, then the others', () => {
  const offers = offersFromAreas(['physical_nutrition', 'substance_use'], []);
  assert.deepEqual(offers.filter(o => o.preselected).map(o => o.goal.title), ['Take my folic acid supplement', 'Alcohol-free days']);
  assert.ok(offers.length > 2);
  assert.equal(new Set(offers.map(o => o.key)).size, offers.length, 'each goal once');
  assert.ok(!offersFromAreas(['physical_nutrition'], ['Take my folic acid supplement']).some(o => o.goal.title === 'Take my folic acid supplement'), 'goals in the plan are left out');
  assert.ok(offersFromAreas([], []).length > 0, 'a general list without a result');
});

test('"No one yet" and the other support choices exclude each other', () => {
  assert.deepEqual(toggleSupport(['family', 'friends'], 'no_one_yet', 'no_one_yet'), ['no_one_yet']);
  assert.deepEqual(toggleSupport(['no_one_yet'], 'family', 'no_one_yet'), ['family']);
  assert.deepEqual(toggleSupport(['family'], 'family', 'no_one_yet'), []);
});
