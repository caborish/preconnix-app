// Suggested goals for each focus area of the assessment result. Wording approved by the owner in chat on
// 30 Oct 2026; changes need the same approval. No doses or medical targets: where a goal has a target, the
// person sets their own number.

export type GoalRhythm = 'once' | 'daily' | 'weekly';
export type TargetUnit = 'km' | 'minutes' | 'days' | 'times';
export type SuggestedCategory =
  | 'checkups_screening' | 'nutrition_supplements' | 'lifestyle' | 'mental_wellbeing' | 'relationships_support'
  | 'contraception_planning' | 'finances_housing' | 'learning';

export interface GoalSuggestion {
  title: string;
  category: SuggestedCategory;
  rhythm: GoalRhythm;
  /** Units the person can choose from when setting their own target (weekly goals only). */
  units?: TargetUnit[];
}

const checkUp: GoalSuggestion = { title: 'Book a preconception check-up', category: 'checkups_screening', rhythm: 'once' };
const bloodPressure: GoalSuggestion = { title: 'Know my blood pressure', category: 'checkups_screening', rhythm: 'once' };
const activity: GoalSuggestion = { title: 'Walk or exercise', category: 'lifestyle', rhythm: 'weekly', units: ['minutes', 'km'] };
const folicAcid: GoalSuggestion = { title: 'Take my folic acid supplement', category: 'nutrition_supplements', rhythm: 'daily' };
const fruitVeg: GoalSuggestion = { title: 'Fruit or vegetables at every meal', category: 'nutrition_supplements', rhythm: 'daily' };
const alcoholFree: GoalSuggestion = { title: 'Alcohol-free days', category: 'lifestyle', rhythm: 'weekly', units: ['days'] };
const smokeFree: GoalSuggestion = { title: 'Smoke-free today', category: 'lifestyle', rhythm: 'daily' };
const metime: GoalSuggestion = { title: '10 minutes for myself', category: 'mental_wellbeing', rhythm: 'daily' };
const trusted: GoalSuggestion = { title: 'Talk to someone I trust', category: 'mental_wellbeing', rhythm: 'weekly' };

/** Focus area code (assessment result domain) → suggested goals, most useful first. */
export const GOAL_SUGGESTIONS: Record<string, GoalSuggestion[]> = {
  physical_medical: [checkUp, bloodPressure, activity],
  obstetric_history: [{ title: 'Discuss my past pregnancies with a health worker', category: 'checkups_screening', rhythm: 'once' }],
  chronic_medications: [{ title: 'Review my medicines with a doctor or pharmacist', category: 'checkups_screening', rhythm: 'once' }],
  physical_nutrition: [folicAcid, fruitVeg, activity],
  sexual_substance: [alcoholFree, smokeFree],
  substance_use: [alcoholFree, smokeFree],
  infectious_immunization: [
    { title: 'Check my vaccination record', category: 'checkups_screening', rhythm: 'once' },
    { title: 'Get tested for infections', category: 'checkups_screening', rhythm: 'once' }
  ],
  mental_social_env: [metime, trusted],
  mental_health_safety: [metime, trusted],
  family_planning: [
    { title: 'Talk with my partner about our plans', category: 'relationships_support', rhythm: 'once' },
    { title: 'Choose contraception that suits our timing', category: 'contraception_planning', rhythm: 'once' }
  ],
  reproductive_genetic: [{ title: 'Ask my family about health conditions that run in it', category: 'checkups_screening', rhythm: 'once' }],
  demographics_timing: [{ title: 'Read the lesson on preconception health', category: 'learning', rhythm: 'once' }]
};

export const suggestionsFor = (domain: string): GoalSuggestion[] => GOAL_SUGGESTIONS[domain] ?? [];
