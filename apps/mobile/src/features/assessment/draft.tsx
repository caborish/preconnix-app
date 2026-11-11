// In-memory assessment draft. Nothing is stored on the device or sent anywhere yet:
// encrypted drafts (MB-08) and server submission (BE-07/08) come later.
import {
  followUpOpen,
  purgeForProfile,
  resolvePathway,
  visibleSections,
  type Definition,
  type ProfileValues,
  type Question,
  type Section
} from '@preconnix/assessment-engine/routing';
import definitionJson from '@preconnix/assessment-definitions/rra/rra-defs-2.0.json';
import { createContext, useContext, useMemo, useState, type ReactNode } from 'react';
import { Alert } from 'react-native';
import type { AssessmentResult } from '@/core/api';

export const definition = definitionJson as unknown as Definition;

const ROUTING_FIELDS = new Set(['plan', 'everpreg', 'relationship']);

interface Draft {
  profile: ProfileValues;
  /** question id → option id */
  answers: Record<string, string>;
  /** question id → ticked follow-up option ids */
  followUps: Record<string, string[]>;
  /** question id → text typed under "Other" */
  followUpOther: Record<string, string>;
  /** heightCm, weightKg, gravida, parity */
  numbers: Record<string, number>;
  /** She does not know her height or weight. */
  noMeasurements: boolean;
}

const allQuestions = new Map<string, Question>(definition.sections.flatMap(s => s.questions.map(q => [q.id, q])));
/** Keeps only the tick-lists that are still open after the answers changed. */
const openFollowUps = (answers: Record<string, string>, followUps: Record<string, string[]>) =>
  Object.fromEntries(Object.entries(followUps).filter(([id]) => followUpOpen(allQuestions.get(id)!, answers[id])));

interface DraftApi extends Draft {
  sections: Section[];
  /** Server result for the submitted draft (in memory only). */
  result: AssessmentResult | null;
  setResult: (r: AssessmentResult | null) => void;
  setProfile: (field: string, value: string) => void;
  setAnswer: (questionId: string, optionId: string) => void;
  toggleFollowUp: (questionId: string, optionId: string) => void;
  setFollowUpOther: (questionId: string, text: string) => void;
  setNumber: (id: string, value: number | null) => void;
  setNoMeasurements: (on: boolean) => void;
  reset: () => void;
  profileComplete: boolean;
}

const DraftContext = createContext<DraftApi | null>(null);

export function DraftProvider({ children }: { children: ReactNode }) {
  const [draft, setDraft] = useState<Draft>({ profile: {}, answers: {}, followUps: {}, followUpOther: {}, numbers: {}, noMeasurements: false });
  const [result, setResult] = useState<AssessmentResult | null>(null);

  const api = useMemo<DraftApi>(() => {
    const profileComplete = definition.profile.every(f => draft.profile[f.id] !== undefined);
    const sections = profileComplete && resolvePathway(definition, draft.profile) ? visibleSections(definition, draft.profile, draft.answers) : [];

    const setProfile = (field: string, value: string) => {
      const nextProfile = { ...draft.profile, [field]: value };
      const apply = (answers: Record<string, string>) => setDraft({ ...draft, profile: nextProfile, answers, followUps: openFollowUps(answers, draft.followUps) });
      if (!ROUTING_FIELDS.has(field) || !definition.profile.every(f => nextProfile[f.id] !== undefined)) {
        apply(draft.answers);
        return;
      }
      const { kept, purged } = purgeForProfile(definition, draft.answers, nextProfile);
      if (purged.length === 0) {
        apply(kept);
        return;
      }
      Alert.alert(
        'Change this answer?',
        `${purged.length} answer${purged.length === 1 ? '' : 's'} you gave no longer apply and will be removed.`,
        [
          { text: 'Keep my answer', style: 'cancel' },
          { text: 'Change', style: 'destructive', onPress: () => apply(kept) }
        ]
      );
    };

    return {
      ...draft,
      sections,
      result,
      setResult,
      profileComplete,
      setProfile,
      setAnswer: (questionId, optionId) =>
        setDraft(d => {
          // An answer can stop a later question from applying; that question's answer goes with it.
          const { kept } = purgeForProfile(definition, { ...d.answers, [questionId]: optionId }, d.profile);
          return { ...d, answers: kept, followUps: openFollowUps(kept, d.followUps) };
        }),
      toggleFollowUp: (questionId, optionId) =>
        setDraft(d => {
          const on = d.followUps[questionId] ?? [];
          return { ...d, followUps: { ...d.followUps, [questionId]: on.includes(optionId) ? on.filter(x => x !== optionId) : [...on, optionId] } };
        }),
      setFollowUpOther: (questionId, text) => setDraft(d => ({ ...d, followUpOther: { ...d.followUpOther, [questionId]: text } })),
      setNumber: (id, value) =>
        setDraft(d => {
          const numbers = { ...d.numbers };
          if (value === null) delete numbers[id]; else numbers[id] = value;
          return { ...d, numbers };
        }),
      setNoMeasurements: on => setDraft(d => ({ ...d, noMeasurements: on })),
      reset: () => {
        setDraft({ profile: {}, answers: {}, followUps: {}, followUpOther: {}, numbers: {}, noMeasurements: false });
        setResult(null);
      }
    };
  }, [draft, result]);

  return <DraftContext.Provider value={api}>{children}</DraftContext.Provider>;
}

export function useDraft(): DraftApi {
  const ctx = useContext(DraftContext);
  if (!ctx) throw new Error('useDraft must be used inside DraftProvider');
  return ctx;
}

/** Route of the section after `sectionId` (or the first section), or the review screen. */
export function nextRoute(sections: Section[], sectionId?: string): string {
  const i = sectionId ? sections.findIndex(s => s.id === sectionId) : -1;
  const next = sections[i + 1];
  return next ? `/assess/section/${next.id}` : '/assess/review';
}
