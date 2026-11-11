// Plain labels for life plan choices. Neutral wording; no clinical advice.
import type { GoalCategory, Horizon, Intention, Rhythm, TargetUnit } from '@/core/api';

/** "Prefer not to say" is no longer offered (Dr Gloria, 5 Nov 2026); an older plan may still have it. */
export const INTENTION_LABEL: Record<Exclude<Intention, 'prefer_not_say'>, string> = {
  planning_now: 'Planning a pregnancy now',
  planning_later: 'Planning a pregnancy later',
  unsure: 'Not sure yet',
  not_planning: 'No, not planning a pregnancy'
};

export const HORIZON_LABEL: Record<Horizon, string> = {
  within_1y: 'Within 1 year',
  '1_2y': '1–2 years',
  '3_5y': '3–5 years',
  '5y_plus': '5+ years',
  not_sure: 'Not sure'
};

export const CATEGORY_LABEL: Record<GoalCategory, string> = {
  checkups_screening: 'Check-ups & screening',
  nutrition_supplements: 'Nutrition & supplements',
  lifestyle: 'Lifestyle',
  mental_wellbeing: 'Mental wellbeing',
  relationships_support: 'Relationships & support',
  contraception_planning: 'Contraception & family planning',
  finances_housing: 'Finances & housing',
  learning: 'Learning',
  other: 'Other'
};

/** Goal category for a result domain, used when a focus area is added to the plan. */
export const DOMAIN_CATEGORY: Record<string, GoalCategory> = {
  demographics_timing: 'learning',
  obstetric_history: 'checkups_screening',
  physical_medical: 'checkups_screening',
  sexual_substance: 'lifestyle',
  mental_social_env: 'mental_wellbeing',
  family_planning: 'contraception_planning',
  physical_nutrition: 'nutrition_supplements',
  infectious_immunization: 'checkups_screening',
  chronic_medications: 'checkups_screening',
  substance_use: 'lifestyle',
  reproductive_genetic: 'checkups_screening',
  mental_health_safety: 'mental_wellbeing'
};

/** Quick due-date choices instead of a date picker. */
export const DUE_OPTIONS: { label: string; months: number | null }[] = [
  { label: 'No date', months: null },
  { label: '1 month', months: 1 },
  { label: '3 months', months: 3 },
  { label: '6 months', months: 6 },
  { label: '1 year', months: 12 }
];

export function dateInMonths(months: number | null, from = new Date()): string | null {
  if (months === null) return null;
  const d = new Date(from);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

export const formatDue = (iso: string | null) =>
  iso ? new Date(`${iso}T12:00:00`).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' }) : null;


export const RHYTHM_LABEL: Record<Rhythm, string> = { once: 'Once', daily: 'Every day', weekly: 'Every week', monthly: 'Every month' };

export const UNIT_LABEL: Record<TargetUnit, string> = { km: 'km', minutes: 'minutes', days: 'days', times: 'times' };

/** Her plans in words; null when not said (or an older "prefer not to say"). */
export const intentionLabel = (i: Intention | null | undefined): string | null => (i && i !== 'prefer_not_say' ? INTENTION_LABEL[i] : null);
