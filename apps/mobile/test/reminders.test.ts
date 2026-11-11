// Reminder rules. Runs with node:test.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { describe, inDays, NEUTRAL_BODY, notificationContent, reminderProblems, triggerFor, type Reminder } from '../src/features/reminders/model.ts';

const base: Reminder = { id: 'r1', label: 'Take my daily supplement', frequency: 'daily', hour: 9, minute: 0, showDetail: false, enabled: true };

test('lock-screen text is neutral unless the person chooses to show details', () => {
  assert.deepEqual(notificationContent(base), { title: 'PreConnix', body: NEUTRAL_BODY });
  assert.deepEqual(notificationContent({ ...base, showDetail: true }), { title: 'PreConnix', body: 'Take my daily supplement' });
});

test('triggers match the chosen frequency', () => {
  assert.deepEqual(triggerFor(base), { type: 'daily', hour: 9, minute: 0 });
  assert.deepEqual(triggerFor({ ...base, frequency: 'weekly', weekday: 4, hour: 18 }), { type: 'weekly', weekday: 4, hour: 18, minute: 0 });
  const once = triggerFor({ ...base, frequency: 'once', date: '2027-01-15', hour: 7 }) as { type: string; date: Date };
  assert.equal(once.type, 'date');
  assert.deepEqual([once.date.getFullYear(), once.date.getMonth(), once.date.getDate(), once.date.getHours()], [2027, 0, 15, 7]);
});

test('invalid reminders are caught before scheduling', () => {
  assert.deepEqual(reminderProblems(base), []);
  assert.ok(reminderProblems({ ...base, label: ' ' }).includes('Add a label'));
  assert.ok(reminderProblems({ ...base, frequency: 'weekly' }).includes('Pick a day'));
  const now = new Date(2026, 9, 29, 10, 0);
  assert.ok(reminderProblems({ ...base, frequency: 'once', date: '2026-10-29', hour: 9 }, now).includes('Pick a time in the future'));
  assert.deepEqual(reminderProblems({ ...base, frequency: 'once', date: inDays(1, now) }, now), []);
});

test('descriptions read naturally', () => {
  assert.equal(describe(base), 'Every day at 09:00');
  assert.equal(describe({ ...base, frequency: 'weekly', weekday: 2, hour: 18 }), 'Every Mon at 18:00');
});

test("a goal's reminder carries only the goal id, and its lock-screen text stays neutral", () => {
  const r: Reminder = { id: 'g-1', label: 'Check in: Walk', frequency: 'weekly', weekday: 2, hour: 18, minute: 0, showDetail: false, enabled: true, goalId: '0b8f…' };
  assert.deepEqual(notificationContent(r), { title: 'PreConnix', body: NEUTRAL_BODY, data: { goalId: '0b8f…' } });
});
