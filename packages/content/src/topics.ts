// Learn topics (design handoff: For you / Topics / Saved) and which lessons suit each result focus area.
// This is organisation only: it changes no lesson wording. A lesson not listed here appears under "More lessons".

/** Icons from the app's outline set used on Learn (apps/mobile/assets/icons). */
export type LearnIcon = 'heart' | 'plan' | 'clipboard' | 'help' | 'sprout' | 'stethoscope' | 'pill' | 'apple' | 'ban' | 'pulse' | 'smile' | 'people' | 'calendar' | 'shield';

export interface Topic {
  id: string;
  title: string;
  summary: string;
  /** Icon from the app's outline set. */
  icon: LearnIcon;
  lessonIds: string[];
}

export const TOPICS: Topic[] = [
  {
    id: 'getting-ready',
    title: 'Getting ready',
    summary: 'What preconception health is, and how a check-up helps',
    icon: 'sprout',
    lessonIds: ['what-is-preconception-health', 'your-preconception-check-up']
  },
  {
    id: 'nutrition-lifestyle',
    title: 'Nutrition & lifestyle',
    summary: 'Folic acid, eating well, and alcohol, smoking and other substances',
    icon: 'apple',
    lessonIds: ['folic-acid-before-pregnancy', 'healthy-weight-and-eating-well', 'alcohol-smoking-and-other-substances']
  },
  {
    id: 'health-wellbeing',
    title: 'Health & wellbeing',
    summary: 'Medicines, infections and vaccines, and mental health',
    icon: 'pulse',
    lessonIds: ['medicines-and-long-term-conditions', 'infections-screening-and-vaccines', 'mental-health-and-stress']
  },
  {
    id: 'planning-together',
    title: 'Planning together',
    summary: 'Your cycle, family planning and spacing pregnancies',
    icon: 'people',
    lessonIds: ['knowing-your-menstrual-cycle', 'family-planning-and-spacing']
  }
];

/** The picture on each lesson's card (owner, 4 Nov 2026: an icon per topic, not a book for every lesson). */
export const LESSON_ICON: Record<string, LearnIcon> = {
  'what-is-preconception-health': 'sprout',
  'your-preconception-check-up': 'stethoscope',
  'folic-acid-before-pregnancy': 'pill',
  'healthy-weight-and-eating-well': 'apple',
  'alcohol-smoking-and-other-substances': 'ban',
  'medicines-and-long-term-conditions': 'pulse',
  'infections-screening-and-vaccines': 'shield',
  'mental-health-and-stress': 'smile',
  'knowing-your-menstrual-cycle': 'calendar',
  'family-planning-and-spacing': 'people'
};

/** The topic a lesson belongs to, if any. */
export const topicOf = (lessonId: string): Topic | undefined => TOPICS.find(t => t.lessonIds.includes(lessonId));

/** Result focus area (assessment domain code) → lessons that speak to it, most relevant first. */
export const FOCUS_LESSONS: Record<string, string[]> = {
  demographics_timing: ['what-is-preconception-health', 'family-planning-and-spacing'],
  obstetric_history: ['your-preconception-check-up', 'family-planning-and-spacing'],
  physical_medical: ['your-preconception-check-up', 'healthy-weight-and-eating-well'],
  physical_nutrition: ['folic-acid-before-pregnancy', 'healthy-weight-and-eating-well'],
  sexual_substance: ['alcohol-smoking-and-other-substances', 'infections-screening-and-vaccines'],
  substance_use: ['alcohol-smoking-and-other-substances'],
  infectious_immunization: ['infections-screening-and-vaccines'],
  chronic_medications: ['medicines-and-long-term-conditions', 'your-preconception-check-up'],
  mental_social_env: ['mental-health-and-stress'],
  mental_health_safety: ['mental-health-and-stress'],
  family_planning: ['family-planning-and-spacing', 'knowing-your-menstrual-cycle'],
  reproductive_genetic: ['your-preconception-check-up', 'medicines-and-long-term-conditions']
};

/** Lesson ids suited to the given focus areas, in order, without repeats. */
export function lessonsForFocus(codes: string[]): string[] {
  return [...new Set(codes.flatMap(c => FOCUS_LESSONS[c] ?? []))];
}
