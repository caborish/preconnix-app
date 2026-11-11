// Pathway and section applicability from declarative definition rules.
// Shared with the app through the `./routing` export (no scoring there); must pass contracts/conformance/routing.

import type { Definition, Pathway, Question, Rule, Section } from './types.ts';

export type { Definition, FollowUp, Option, Pathway, ProfileField, Question, Rule, Section } from './types.ts';

/** Profile field id → plain value, e.g. { plan: 'no', everpreg: 'yes' }. */
export type ProfileValues = Record<string, string>;

export function matches(rule: Rule, values: ProfileValues): boolean {
  const test = (c: { field: string; eq?: string; in?: string[] }) => {
    const v = values[c.field];
    if (v === undefined) return false;
    if (c.eq !== undefined && v !== c.eq) return false;
    if (c.in !== undefined && !c.in.includes(v)) return false;
    return true;
  };
  const allOk = (rule.all ?? []).every(test);
  const anyOk = rule.any === undefined || rule.any.some(test);
  return allOk && anyOk;
}

export function resolvePathway(def: Definition, values: ProfileValues): Pathway | null {
  const hit = def.pathways.find(p => matches(p.when, values));
  return hit ? hit.id : null;
}

export function applicableSections(def: Definition, values: ProfileValues): Section[] {
  return def.sections.filter(s => matches(s.applicableWhen, values));
}

/** Question id → option id. */
export type Answers = Record<string, string>;

export const questionApplies = (q: Question, values: ProfileValues, answers: Answers = {}) =>
  !q.showWhen || matches(q.showWhen, { ...values, ...answers });

/** Applicable sections holding only the questions to ask now, given the answers so far. */
export function visibleSections(def: Definition, values: ProfileValues, answers: Answers = {}): Section[] {
  return applicableSections(def, values)
    .map(s => ({ ...s, questions: s.questions.filter(q => questionApplies(q, values, answers)).map(q => (q.altText && matches(q.altText.when, values) ? { ...q, text: q.altText.text } : q)) }))
    .filter(s => s.questions.length > 0);
}

export function applicableQuestionIds(def: Definition, values: ProfileValues, answers: Answers = {}): string[] {
  return visibleSections(def, values, answers).flatMap(s => s.questions.map(q => q.id));
}

/** The kind word to show under this answer, if any. */
export const noteFor = (q: Question, optionId: string | undefined) => (q.note && optionId && q.note.when.includes(optionId) ? q.note.text : null);

/** The answer option a total number of pregnancies falls in. */
export function countOption(q: Question, gravida: number): string | null {
  return q.pregnancyCounts?.bands.find(b => b.upTo === undefined || gravida <= b.upTo)?.option ?? null;
}

/** Whether this answer opens the question's tick-list. */
export const followUpOpen = (q: Question, optionId: string | undefined) => !!q.followUp && !!optionId && q.followUp.when.includes(optionId);

/**
 * After a profile or answer change, splits existing answers into those that still apply and those that must be
 * discarded (never stored or sent). Fixes legacy finding L-07.
 */
export function purgeForProfile(
  def: Definition,
  answers: Record<string, string>,
  values: ProfileValues
): { kept: Record<string, string>; purged: string[] } {
  const kept: Record<string, string> = { ...answers };
  const purged: string[] = [];
  // Repeats because removing one answer can make a question that depended on it stop applying.
  for (;;) {
    const applicable = new Set(applicableQuestionIds(def, values, kept));
    const out = Object.keys(kept).filter(qid => !applicable.has(qid));
    if (!out.length) return { kept, purged };
    for (const qid of out) { delete kept[qid]; purged.push(qid); }
  }
}
