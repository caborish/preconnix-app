// Weekly progress and streaks for repeating goals. Runs with node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { goalProgress, progressLine, weekStart } from '../src/features/plan/progress.ts';
import { GOAL_SUGGESTIONS } from '../../../packages/content/src/goals.ts';

// Thursday 30 Oct 2026; that week starts Monday 26 Oct.
const today = '2026-10-30';
const goal = (g: Partial<Parameters<typeof goalProgress>[0]>) => ({ rhythm: 'weekly' as const, target: null, checkins: [], status: 'open' as const, ...g });

test('weeks start on Monday', () => {
  assert.equal(weekStart('2026-10-30'), '2026-10-26');
  assert.equal(weekStart('2026-10-26'), '2026-10-26');
  assert.equal(weekStart('2026-11-01'), '2026-10-26', 'Sunday belongs to the week before');
});

test('a km target adds up this week only', () => {
  const g = goal({ target: { amount: 10, unit: 'km' }, checkins: [{ day: '2026-10-25', amount: 5 }, { day: '2026-10-27', amount: 4.5 }, { day: '2026-10-29', amount: 2 }] });
  const p = goalProgress(g, today);
  assert.deepEqual({ w: p.thisWeek, s: p.weekShare, due: p.due }, { w: 6.5, s: 0.65, due: false });
  assert.equal(progressLine(g, today), '6.5 of 10 km this week');
});

test('a days target counts days, capped at the target', () => {
  const g = goal({ target: { amount: 2, unit: 'days' }, checkins: ['2026-10-26', '2026-10-27', '2026-10-28'].map(day => ({ day, amount: null })) });
  assert.deepEqual([goalProgress(g, today).thisWeek, goalProgress(g, today).weekShare], [3, 1]);
});

test('daily streaks count back from today, or from yesterday before today is checked', () => {
  const days = ['2026-10-27', '2026-10-28', '2026-10-29'].map(day => ({ day, amount: null }));
  const g = goal({ rhythm: 'daily', checkins: days });
  assert.deepEqual({ s: goalProgress(g, today).streak, due: goalProgress(g, today).due }, { s: 3, due: true });
  const checked = goal({ rhythm: 'daily', checkins: [...days, { day: today, amount: null }] });
  assert.deepEqual({ s: goalProgress(checked, today).streak, due: goalProgress(checked, today).due }, { s: 4, due: false });
  assert.equal(progressLine(checked, today), '4 days in a row');
});

test('weekly goals are due until something is checked in this week; done goals are never due', () => {
  assert.equal(goalProgress(goal({ checkins: [{ day: '2026-10-20', amount: null }] }), today).due, true);
  assert.equal(goalProgress(goal({ checkins: [{ day: '2026-10-20', amount: null }], status: 'done' }), today).due, false);
});

test('one-off goals have no progress line', () => {
  assert.equal(progressLine(goal({ rhythm: 'once' }), today), null);
});

test('every suggested goal is well formed: units only on weekly goals', () => {
  for (const [domain, list] of Object.entries(GOAL_SUGGESTIONS)) {
    assert.ok(list.length > 0, domain);
    for (const s of list) {
      assert.ok(s.title.length > 3 && s.title.length <= 120, s.title);
      if (s.units) assert.equal(s.rhythm, 'weekly', s.title);
    }
  }
});
