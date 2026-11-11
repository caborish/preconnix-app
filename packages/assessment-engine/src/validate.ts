// Server-side validation of a submission against a pinned definition.

import { applicableQuestionIds, countOption, followUpOpen, resolvePathway } from './routing.ts';
import type { ProfileValues } from './routing.ts';
import type { Definition, Pathway, Submission, ValidationIssue } from './types.ts';

export interface ValidationResult {
  ok: boolean;
  issues: ValidationIssue[];
  values: ProfileValues;
  pathway: Pathway | null;
  applicableQuestionIds: string[];
}

export function validateSubmission(def: Definition, sub: Submission): ValidationResult {
  const issues: ValidationIssue[] = [];
  const values: ProfileValues = {};

  for (const field of def.profile) {
    const optionId = sub.profile[field.id];
    if (optionId === undefined) {
      if (field.required) issues.push({ code: 'missing_profile', ref: field.id });
      continue;
    }
    const opt = field.options.find(o => o.id === optionId);
    if (!opt || opt.value === undefined) issues.push({ code: 'invalid_profile_option', ref: field.id });
    else values[field.id] = opt.value;
  }
  for (const key of Object.keys(sub.profile)) {
    if (!def.profile.some(f => f.id === key)) issues.push({ code: 'invalid_profile_option', ref: key });
  }

  const pathway = issues.length ? null : resolvePathway(def, values);
  const applicable = pathway ? applicableQuestionIds(def, values, sub.answers) : [];
  const applicableSet = new Set(applicable);
  const questions = new Map(def.sections.flatMap(s => s.questions).map(q => [q.id, q]));

  for (const [qid, optionId] of Object.entries(sub.answers)) {
    const q = questions.get(qid);
    if (!q) issues.push({ code: 'unknown_question', ref: qid });
    else if (pathway && !applicableSet.has(qid)) issues.push({ code: 'question_not_applicable', ref: qid });
    else if (!q.options.some(o => o.id === optionId)) issues.push({ code: 'invalid_option', ref: qid });
  }
  for (const qid of applicable) {
    if (sub.answers[qid] === undefined) issues.push({ code: 'missing_answer', ref: qid });
  }

  for (const [qid, ticked] of Object.entries(sub.followUps ?? {})) {
    const q = questions.get(qid);
    const known = new Set(q?.followUp?.options.map(o => o.id));
    if (!q || !followUpOpen(q, sub.answers[qid]) || !ticked.every(id => known.has(id))) issues.push({ code: 'invalid_follow_up', ref: qid });
  }

  const numbers = sub.numbers ?? {};
  const given = (def.measurements ?? []).filter(m => numbers[m.id] !== undefined);
  if (given.length && given.length !== (def.measurements ?? []).length) issues.push({ code: 'invalid_number', ref: 'measurements' });
  for (const m of given) if (!(numbers[m.id] >= m.min && numbers[m.id] <= m.max)) issues.push({ code: 'invalid_number', ref: m.id });
  for (const qid of applicable) {
    const q = questions.get(qid);
    const counts = q?.pregnancyCounts;
    if (!q || !counts) continue;
    const { gravida, parity } = numbers;
    const whole = Number.isInteger(gravida) && Number.isInteger(parity);
    if (!whole || gravida < 1 || gravida > counts.max || parity < 0 || parity > gravida || countOption(q, gravida) !== sub.answers[qid]) {
      issues.push({ code: 'invalid_number', ref: qid });
    }
  }

  return { ok: issues.length === 0, issues, values, pathway, applicableQuestionIds: applicable };
}
