// Deterministic scoring with a pinned policy. rra-legacy-1.0.0 reproduces preconnix.com/rra exactly.

import { applicableSections } from './routing.ts';
import { validateSubmission } from './validate.ts';
import type { Definition, DomainResult, Policy, ScoreResult, Submission, ValidationIssue } from './types.ts';

export class AssessmentValidationError extends Error {
  issues: ValidationIssue[];
  constructor(issues: ValidationIssue[]) {
    super(`Assessment is not valid: ${issues.map(i => `${i.code}(${i.ref})`).join(', ')}`);
    this.name = 'AssessmentValidationError';
    this.issues = issues;
  }
}

/** round(100 × earned / max), halves rounded up, in integer arithmetic (matches JS Math.round for these values). */
export function roundHalfUpPercent(earned: number, max: number): number {
  return Math.floor((200 * earned + max) / (2 * max));
}

/** BMI to one decimal place and its band under this policy, or null without a height and weight. */
export function bmiFrom(numbers: Record<string, number>, policy: Policy) {
  const { heightCm, weightKg } = numbers;
  if (!policy.bmi || heightCm === undefined || weightKg === undefined) return null;
  const value = Math.round((weightKg / (heightCm / 100) ** 2) * 10) / 10;
  return { value, band: policy.bmi.bands.find(b => b.below === undefined || value < b.below)! };
}

export function score(def: Definition, policy: Policy, sub: Submission): ScoreResult {
  if (policy.definitionId !== def.definitionId) {
    throw new AssessmentValidationError([{ code: 'policy_definition_mismatch', ref: policy.policyId }]);
  }
  const v = validateSubmission(def, sub);
  if (!v.ok || !v.pathway) throw new AssessmentValidationError(v.issues);
  const pathway = v.pathway;

  const bmi = bmiFrom(sub.numbers ?? {}, policy);

  const pointsFor = (item: string): number => {
    if (item === 'bmi') return bmi!.band.points;
    if (item.startsWith('profile.')) {
      const field = item.slice('profile.'.length);
      const p = policy.profilePoints[pathway]?.[field]?.[v.values[field]];
      if (p === undefined) throw new Error(`Policy has no points for ${item}=${v.values[field]}`);
      return p;
    }
    const p = policy.itemPoints[sub.answers[item]];
    if (p === undefined) throw new Error(`Policy has no points for option ${sub.answers[item]}`);
    return p;
  };

  const sectionIds = new Set(applicableSections(def, v.values).map(s => s.id));
  const asked = new Set(v.applicableQuestionIds);
  let earned = 0;
  let max = 0;
  let scoredItemCount = 0;
  const domains: DomainResult[] = [];
  for (const d of policy.domains[pathway]) {
    if (d.sectionId && !sectionIds.has(d.sectionId)) continue;
    // A question that was not asked counts neither for nor against her.
    const items = d.items.filter(item => (item === 'bmi' ? !!bmi : item.startsWith('profile.') || asked.has(item)));
    if (!items.length) continue;
    const dEarned = items.reduce((sum, item) => sum + pointsFor(item), 0);
    const dMax = items.length * 2;
    earned += dEarned;
    max += dMax;
    scoredItemCount += items.length;
    domains.push({ code: d.code, name: d.name, earned: dEarned, max: dMax, percent: roundHalfUpPercent(dEarned, dMax) });
  }

  const overallScore = roundHalfUpPercent(earned, max);
  const band = [...policy.bands].sort((a, b) => b.min - a.min).find(b => overallScore >= b.min);
  if (!band) throw new Error('Policy bands do not cover score ' + overallScore);

  const chosen = new Set(Object.values(sub.answers));
  const safetyFlags = policy.safetyRules
    .filter(r => r.whenAnyOption.some(o => chosen.has(o)))
    .map(r => ({ code: r.flag, status: r.status }));

  const reportNotes: string[] = [];
  const notes = def.sections.flatMap(s => s.questions).filter(q => asked.has(q.id)).flatMap(q => {
    const answer = sub.answers[q.id];
    const lines: string[] = [];
    if (q.resultNote?.when.includes(answer)) lines.push(q.resultNote.text);
    const ticked = q.followUp?.when.includes(answer) ? sub.followUps?.[q.id] ?? [] : [];
    if (q.followUp?.resultNote && ticked.length) {
      lines.push(q.followUp.resultNote.replace('{list}', q.followUp.options.filter(o => ticked.includes(o.id)).map(o => o.label).join(', ')));
    }
    if (q.followUp?.reportNote && ticked.length) {
      reportNotes.push(q.followUp.reportNote.replace('{list}', q.followUp.options.filter(o => ticked.includes(o.id)).map(o => o.label).join(', ')));
    }
    if (q.reportNote?.when.includes(answer)) reportNotes.push(q.reportNote.text);
    if (q.pregnancyCounts) reportNotes.push(q.pregnancyCounts.reportNote.replace('{gravida}', String(sub.numbers!.gravida)).replace('{parity}', String(sub.numbers!.parity)));
    return lines;
  });
  if (bmi) notes.unshift(policy.bmi!.note.replace('{value}', bmi.value.toFixed(1)).replace('{label}', bmi.band.label));
  const support = (policy.supportRules ?? []).filter(r => r.whenAnyOption.some(o => chosen.has(o))).map(r => r.topic);

  return {
    definitionId: def.definitionId,
    policyId: policy.policyId,
    scoringStatus: policy.scoringStatus,
    pathway,
    overall: { earned, max, score: overallScore, band: band.code, bandLabel: band.label },
    domains,
    scoredItemCount,
    safetyFlags,
    notes,
    reportNotes,
    ...(bmi ? { bmi: { value: bmi.value, band: bmi.band.code } } : {}),
    support
  };
}
