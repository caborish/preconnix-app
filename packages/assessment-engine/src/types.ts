// Shared types for assessment definitions, scoring policies, submissions and results.

export type Pathway = 'pregnancy_planning' | 'general_wellness';

export interface Condition {
  field: string;
  eq?: string;
  in?: string[];
}

export interface Rule {
  all?: Condition[];
  any?: Condition[];
}

export interface Option {
  id: string;
  label: string;
  value?: string;
}

/** A tick-list opened by certain answers. Never scored. */
export interface FollowUp {
  prompt: string;
  /** Option ids of the parent question that open the list. */
  when: string[];
  options: { id: string; label: string }[];
  /** Shown with the result; `{list}` becomes the ticked labels. */
  resultNote?: string;
  /** Printed on the report only. */
  reportNote?: string;
}

/** Two number boxes in place of the answer list; the first picks the scored answer. */
export interface PregnancyCounts {
  gravidaLabel: string;
  parityLabel: string;
  max: number;
  bands: { upTo?: number; option: string }[];
  reportNote: string;
}

export interface Measurement { id: string; label: string; unit: string; example: string; min: number; max: number }

export interface Question {
  id: string;
  number: number;
  text: string;
  sectionDivider: string | null;
  options: Option[];
  /** Asked only when this holds. `field` may be a profile field or an earlier question id. */
  showWhen?: Rule;
  followUp?: FollowUp;
  /** Shown with the result after these answers. */
  resultNote?: { when: string[]; text: string };
  /** Printed on the report only, after these answers. */
  reportNote?: { when: string[]; text: string };
  /** A short kind word under the answer; she moves on when ready. */
  note?: { when: string[]; text: string };
  /** Other wording when this holds, such as no partner. */
  altText?: { when: Rule; text: string };
  pregnancyCounts?: PregnancyCounts;
}

export interface Section {
  id: string;
  tag: string;
  title: string;
  subtitle: string;
  applicableWhen: Rule;
  questions: Question[];
}

export interface ProfileField {
  id: string;
  label: string;
  required: boolean;
  options: Option[];
}

export interface Definition {
  definitionId: string;
  instrument: string;
  status: 'draft' | 'testing' | 'approved' | 'retired';
  source?: { file: string; sha256: string };
  pathways: { id: Pathway; when: Rule }[];
  profile: ProfileField[];
  sections: Section[];
  /** Optional height and weight, asked with the profile. */
  measurements?: Measurement[];
}

export interface PolicyDomain {
  code: string;
  name: string;
  /** Question ids, or `profile.<field>` for scored profile items. */
  items: string[];
  /** When set, the domain is scored only if this section applies. */
  sectionId?: string;
}

export interface SafetyRule {
  flag: string;
  whenAnyOption: string[];
  status: string;
}

export interface Policy {
  policyId: string;
  definitionId: string;
  status: 'draft' | 'testing' | 'approved' | 'retired';
  isLegacyParity: boolean;
  scoringStatus: 'legacy_unvalidated' | 'approved_for_testing' | 'clinically_approved';
  rounding: 'half_up_integer';
  aggregation: 'sum_of_points';
  itemPoints: Record<string, number>;
  profilePoints: Record<Pathway, Record<string, Record<string, number>>>;
  domains: Record<Pathway, PolicyDomain[]>;
  bands: { code: string; label: string; min: number }[];
  safetyRules: SafetyRule[];
  clinicalFlags: string[];
  bmi?: { bands: { below?: number; code: string; label: string; points: number }[]; note: string };
  supportRules?: { topic: string; whenAnyOption: string[] }[];
}

/** What a client submits: option ids only, never scores. */
export interface Submission {
  /** Profile field id → profile option id, e.g. { plan: 'profile.plan.no' }. */
  profile: Record<string, string>;
  /** Question id → option id, e.g. { n1: 'n1.a' }. */
  answers: Record<string, string>;
  /** Question id → ticked follow-up option ids. */
  followUps?: Record<string, string[]>;
  /** heightCm, weightKg, gravida, parity. */
  numbers?: Record<string, number>;
}

export type IssueCode =
  | 'missing_profile'
  | 'invalid_profile_option'
  | 'unknown_question'
  | 'question_not_applicable'
  | 'invalid_option'
  | 'missing_answer'
  | 'invalid_follow_up'
  | 'invalid_number'
  | 'policy_definition_mismatch';

export interface ValidationIssue {
  code: IssueCode;
  /** Profile field id or question id the issue is about. */
  ref: string;
}

export interface DomainResult {
  code: string;
  name: string;
  earned: number;
  max: number;
  percent: number;
}

export interface ScoreResult {
  definitionId: string;
  policyId: string;
  scoringStatus: Policy['scoringStatus'];
  pathway: Pathway;
  overall: { earned: number; max: number; score: number; band: string; bandLabel: string };
  domains: DomainResult[];
  scoredItemCount: number;
  safetyFlags: { code: string; status: string }[];
  /** Plain lines shown with the result, from the definition. Absent on older saved results. */
  notes?: string[];
  /** Printed on the report only. */
  reportNotes?: string[];
  bmi?: { value: number; band: string };
  /** Private support topics her answers call for. */
  support?: string[];
}
