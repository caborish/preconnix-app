// Progress for repeating goals, worked out on the phone from the goal's recent check-ins.
// Weeks run Monday to Sunday in the person's local time. Plain TypeScript, unit-tested with node:test.
import type { Checkin, GoalTarget, PlanGoal, Rhythm } from '../../core/api.ts';

const pad = (n: number) => String(n).padStart(2, '0');

/** Local date as YYYY-MM-DD. */
export const localDay = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
};

/** Monday of the week containing `day`. */
export function weekStart(day: string): string {
  const [y, m, d] = day.split('-').map(Number);
  const weekday = (new Date(y, m - 1, d).getDay() + 6) % 7; // Monday = 0
  return addDays(day, -weekday);
}

/** How much a check-in counts towards a target: its amount for km/minutes, one for days/times or no amount. */
const worth = (c: Checkin, target: GoalTarget | null) =>
  target && (target.unit === 'km' || target.unit === 'minutes') ? c.amount ?? 0 : 1;

export interface GoalProgress {
  rhythm: Rhythm;
  checkedToday: boolean;
  /** Today's amount, if one was entered. */
  todayAmount: number | null;
  /** Sum (km, minutes) or count (days, times, no target) this week. */
  thisWeek: number;
  /** 0–1 towards the weekly target, or null without one. */
  weekShare: number | null;
  /** Daily: days in a row up to today (or yesterday, if today is not checked yet). Weekly: weeks in a row with a check-in. */
  streak: number;
  /** A check-in is due: daily goals not checked today, weekly goals with nothing this week, monthly with nothing this month. */
  due: boolean;
}

export function goalProgress(goal: Pick<PlanGoal, 'rhythm' | 'target' | 'checkins' | 'status'>, today = localDay()): GoalProgress {
  const days = new Map(goal.checkins.map(c => [c.day, c]));
  const todays = days.get(today);
  const monday = weekStart(today);
  const thisWeek = goal.checkins.filter(c => c.day >= monday && c.day <= today).reduce((n, c) => n + worth(c, goal.target), 0);

  let streak = 0;
  if (goal.rhythm === 'daily') {
    let d = todays ? today : addDays(today, -1);
    while (days.has(d)) { streak++; d = addDays(d, -1); }
  } else if (goal.rhythm === 'weekly') {
    const weeks = new Set(goal.checkins.map(c => weekStart(c.day)));
    let w = weeks.has(monday) ? monday : addDays(monday, -7);
    while (weeks.has(w)) { streak++; w = addDays(w, -7); }
  } else if (goal.rhythm === 'monthly') {
    const months = new Set(goal.checkins.map(c => c.day.slice(0, 7)));
    const [y, m] = today.split('-').map(Number);
    let d = new Date(y, m - 1, 1);
    if (!months.has(localDay(d).slice(0, 7))) d = new Date(y, m - 2, 1);
    while (months.has(localDay(d).slice(0, 7))) { streak++; d = new Date(d.getFullYear(), d.getMonth() - 1, 1); }
  }

  const open = goal.status === 'open';
  return {
    rhythm: goal.rhythm,
    checkedToday: !!todays,
    todayAmount: todays?.amount ?? null,
    thisWeek: Math.round(thisWeek * 10) / 10,
    weekShare: goal.target ? Math.min(1, thisWeek / goal.target.amount) : null,
    streak,
    due: open && (goal.rhythm === 'daily' ? !todays : goal.rhythm === 'weekly' ? thisWeek === 0
      : goal.rhythm === 'monthly' ? !goal.checkins.some(c => c.day.slice(0, 7) === today.slice(0, 7)) : false)
  };
}

const UNIT_WORD: Record<GoalTarget['unit'], [string, string]> = { km: ['km', 'km'], minutes: ['minute', 'minutes'], days: ['day', 'days'], times: ['time', 'times'] };
export const unitWord = (unit: GoalTarget['unit'], n: number) => UNIT_WORD[unit][n === 1 ? 0 : 1];

/** One line under a goal, e.g. "6 of 10 km this week" or "4 days in a row". */
export function progressLine(goal: Pick<PlanGoal, 'rhythm' | 'target' | 'checkins' | 'status'>, today = localDay()): string | null {
  if (goal.rhythm === 'once') return null;
  const p = goalProgress(goal, today);
  if (goal.target) return `${p.thisWeek} of ${goal.target.amount} ${unitWord(goal.target.unit, goal.target.amount)} this week`;
  if (goal.rhythm === 'monthly') return p.streak > 1 ? `${p.streak} months in a row` : p.due ? 'Not checked in this month' : 'Done this month';
  if (goal.rhythm === 'daily') return p.streak > 1 ? `${p.streak} days in a row` : p.checkedToday ? 'Done today' : 'Not checked in today';
  return p.streak > 1 ? `${p.streak} weeks in a row` : p.thisWeek ? 'Done this week' : 'Not checked in this week';
}

/** Whether a check-in for this goal asks for an amount (targets in km or minutes). */
export const asksAmount = (target: GoalTarget | null) => !!target && (target.unit === 'km' || target.unit === 'minutes');
