// Plan set-up helpers (design handoff: intentions → priorities → actions → review). Plain TypeScript, unit-tested.
import { GOAL_SUGGESTIONS, type GoalSuggestion } from '@preconnix/content';

export const MAX_PRIORITIES = 3;
export const SETUP_STEPS = ['Your intentions', 'Your priorities', 'Your actions', 'Review'] as const;

export interface PriorityOption {
  /** Stable key: the suggestion title. */
  key: string;
  domain: string;
  index: number;
  suggestion: GoalSuggestion;
  /** Already a goal in the plan (shown as chosen, not counted). */
  inPlan: boolean;
}

/**
 * Suggested priorities: those for the latest result's focus areas first (lowest-scoring first), then the rest,
 * each title once.
 */
export function priorityOptions(focusCodes: string[], existingTitles: string[]): PriorityOption[] {
  const have = new Set(existingTitles.map(t => t.toLowerCase()));
  const domains = [...focusCodes, ...Object.keys(GOAL_SUGGESTIONS).filter(d => !focusCodes.includes(d))];
  const seen = new Set<string>();
  const out: PriorityOption[] = [];
  for (const domain of domains) {
    (GOAL_SUGGESTIONS[domain] ?? []).forEach((suggestion, index) => {
      if (seen.has(suggestion.title)) return;
      seen.add(suggestion.title);
      out.push({ key: suggestion.title, domain, index, suggestion, inPlan: have.has(suggestion.title.toLowerCase()) });
    });
  }
  return out;
}

/** Chooses or unchooses a priority. A fourth choice is refused so the person can swap one out instead. */
export function togglePriority(selected: string[], key: string, max = MAX_PRIORITIES): { selected: string[]; refused: boolean } {
  if (selected.includes(key)) return { selected: selected.filter(k => k !== key), refused: false };
  if (selected.length >= max) return { selected, refused: true };
  return { selected: [...selected, key], refused: false };
}

/** Review date choices, in months from today. */
export const REVIEW_OPTIONS = [{ label: 'In 1 month', months: 1 }, { label: 'In 3 months', months: 3 }, { label: 'In 6 months', months: 6 }];

// ── Guided walk-through (owner, 1 Nov 2026): one question per card, like the assessment ──

export const REVIEW_MONTHS = 3;
/** Reminder day for weekly goals set in the walk-through: Monday (1 = Sunday … 7 = Saturday). */
export const WEEKLY_REMINDER_DAY = 2;

/** The areas the walk-through starts from: the result's focus areas, lowest-scoring first, at most three. */
export const startingAreas = (focus: { code: string; percent: number }[]) =>
  [...focus].sort((a, b) => a.percent - b.percent).slice(0, MAX_PRIORITIES).map(f => f.code);

/** Suggested goals for one area that are not already in the plan (or already picked for another area). */
export function goalChoices(domain: string, takenTitles: string[]): GoalSuggestion[] {
  const taken = new Set(takenTitles.map(t => t.toLowerCase()));
  return (GOAL_SUGGESTIONS[domain] ?? []).filter(s => !taken.has(s.title.toLowerCase()));
}

/** Without a result: one general list of suggestions, each once. */
export const GENERAL_AREA = 'general';
export const generalChoices = (takenTitles: string[]) =>
  priorityOptions([], takenTitles).filter(o => !o.inPlan).map(o => o.suggestion);

/** What happens to a goal at a plan review. */
export type ReviewChoice = 'keep' | 'done' | 'remove';

// ── Plan guide (owner, 4 Nov 2026: SOGC's plan adapted for Nigeria, guided by the result) ──

/** Goals picked for the next three months, at most this many at once. */
export const MAX_PICKS = 5;

/** A goal offered in "Your next 3 months": from the guide's essentials, or from the result areas' suggestions. */
export interface GoalOffer { key: string; goal: GoalSuggestion; domain: string | null; why: string | null; reason: string | null; preselected: boolean }

/**
 * Without the (not yet approved) guide: the approved suggestions for each focus area, one per area ticked, then
 * the rest; without a result, the general list.
 */
export function offersFromAreas(focusCodes: string[], takenTitles: string[]): GoalOffer[] {
  if (!focusCodes.length) return generalChoices(takenTitles).slice(0, 6).map((goal, i) => ({ key: goal.title, goal, domain: null, why: null, reason: null, preselected: i < 2 }));
  const seen = new Set<string>();
  const firsts: GoalOffer[] = [];
  const rest: GoalOffer[] = [];
  for (const domain of focusCodes) {
    goalChoices(domain, takenTitles).forEach((goal, i) => {
      if (seen.has(goal.title)) return;
      seen.add(goal.title);
      (i === 0 ? firsts : rest).push({ key: goal.title, goal, domain, why: null, reason: null, preselected: i === 0 });
    });
  }
  return [...firsts, ...rest];
}

/** Ticks or unticks a support choice; "No one yet" and the others exclude each other. */
export function toggleSupport<T extends string>(selected: T[], value: T, none: T): T[] {
  if (selected.includes(value)) return selected.filter(v => v !== value);
  return value === none ? [none] : [...selected.filter(v => v !== none), value];
}
