// Minimal API client. Generated OpenAPI client replaces it later (doc 03 §1).
// On the local server, people who have not signed in use dev sign-in: a random synthetic subject kept in secure
// storage, so the same test account (and its saved history) is used across app launches. The Azure server
// (EXPO_PUBLIC_API_URL) has no dev sign-in, so the app asks for email sign-in when it first needs the server.
import Constants from 'expo-constants';
import * as SecureStore from 'expo-secure-store';
import { getAccessToken, onSignInChange, signInWithEmail } from './auth';
import type { FamilyPicture, SupportOption } from '@preconnix/content';

export interface DomainResult {
  code: string;
  name: string;
  percent: number;
  earned: number;
  max: number;
}

export interface AssessmentResult {
  assessmentId: string;
  saved: boolean;
  /** Country code from the assessment profile, e.g. 'NG'. Drives country-specific links. */
  country: string | null;
  pathway: 'pregnancy_planning' | 'general_wellness';
  definitionId: string;
  scoringPolicyId: string;
  scoringStatus: 'legacy_unvalidated' | 'approved_for_testing' | 'clinically_approved';
  overall: { score: number; earned: number; max: number; band: 'high' | 'moderate' | 'low'; bandLabel: string };
  domains: DomainResult[];
  safetyFlags: { code: string }[];
  notes?: string[];
  bmi?: { value: number; band: string } | null;
  support?: SupportMessage[];
  computedAt: string;
}

export interface AssessmentSummary {
  id: string;
  status: 'draft' | 'scored' | 'voided';
  pathway: AssessmentResult['pathway'] | null;
  startedAt: string;
  submittedAt: string | null;
  score: number | null;
  band: AssessmentResult['overall']['band'] | null;
}

export type ConsentPurpose =
  | 'terms_privacy'
  | 'health_processing'
  | 'history_storage'
  | 'email_comms'
  | 'product_analytics'
  | 'research_deidentified'
  | 'ai_explanation';

export class ApiError extends Error {
  status: number;
  code: string;
  constructor(status: number, code: string) {
    super(code);
    this.status = status;
    this.code = code;
  }
}

/** True when the app talks to the Azure server rather than the local one on the Mac. */
export const usesRemoteServer = !!process.env.EXPO_PUBLIC_API_URL;

/** Local server on the same machine as the Expo dev server, unless EXPO_PUBLIC_API_URL is set. */
export function apiBaseUrl(): string {
  if (process.env.EXPO_PUBLIC_API_URL) return process.env.EXPO_PUBLIC_API_URL;
  const host = Constants.expoConfig?.hostUri?.split(':')[0] ?? 'localhost';
  return `http://${host}:3000`;
}

/** Plain words for a failed request, matching where the app's server is. */
export function problemMessage(e: unknown): string {
  if (e instanceof ApiError && e.code === 'sign_in_required') return 'Please sign in with your email to continue (Account tab).';
  if (e instanceof ApiError && e.code === 'network_unreachable') {
    return usesRemoteServer
      ? "Can't reach PreConnix. Check your connection and try again."
      : "Can't reach the PreConnix test server. Check you're on the same Wi-Fi as the Mac.";
  }
  return 'Something went wrong. Please try again.';
}

const SUBJECT_KEY = 'pcx.devSubject';
let token: string | null = null;

/** Not a security feature: ids only need to be unique. */
function uuidV4(): string {
  const hex = Array.from({ length: 32 }, () => Math.floor(Math.random() * 16).toString(16));
  hex[12] = '4';
  hex[16] = ((parseInt(hex[16], 16) & 0x3) | 0x8).toString(16);
  const h = hex.join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}

async function devSubject(): Promise<string> {
  const existing = await SecureStore.getItemAsync(SUBJECT_KEY);
  if (existing) return existing;
  const subject = `dev-${uuidV4()}`;
  await SecureStore.setItemAsync(SUBJECT_KEY, subject);
  return subject;
}

async function raw(method: string, path: string, body?: unknown, headers: Record<string, string> = {}) {
  try {
    return await fetch(apiBaseUrl() + path, {
      method,
      headers: {
        ...(body !== undefined ? { 'content-type': 'application/json' } : {}),
        ...(token ? { authorization: `Bearer ${token}` } : {}),
        ...headers
      },
      body: body !== undefined ? JSON.stringify(body) : undefined
    });
  } catch {
    throw new ApiError(0, 'network_unreachable');
  }
}

// Real email sign-in when the person has signed in; otherwise the synthetic dev account (local server) or the
// email sign-in page (Azure server).
onSignInChange(() => { token = null; });

// Several screens can ask at once; they share one sign-in page.
let prompting: Promise<boolean> | null = null;

async function signIn() {
  token = null;
  let member = await getAccessToken();
  if (!member && usesRemoteServer) {
    prompting ??= signInWithEmail().catch(() => false).finally(() => { prompting = null; });
    if (await prompting) member = await getAccessToken();
    if (!member) throw new ApiError(401, 'sign_in_required');
  }
  if (member) {
    token = member;
    return;
  }
  const res = await raw('POST', '/dev/token', { subject: await devSubject() });
  if (!res.ok) throw new ApiError(res.status, 'sign_in_failed');
  token = (await res.json()).accessToken;
}

async function request<T>(method: string, path: string, body?: unknown, headers: Record<string, string> = {}): Promise<T> {
  if (!token) await signIn();
  let res = await raw(method, path, body, headers);
  if (res.status === 401) {
    // Tokens expire after 15 minutes, and the local server issues new signing keys when it restarts.
    await signIn();
    res = await raw(method, path, body, headers);
  }
  if (res.status === 204) return undefined as T;
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, typeof data.code === 'string' ? data.code : 'unknown_error');
  return data as T;
}

// ── Content (public: general education, the same for everyone) ──
export async function getContent(includeDrafts: boolean): Promise<{ lessons: import('@preconnix/content').Lesson[]; settings: import('@preconnix/content').ContentSettings }> {
  const res = await raw('GET', `/v1/content${includeDrafts ? '?preview=drafts' : ''}`);
  if (!res.ok) throw new ApiError(res.status, 'content_unavailable');
  return res.json();
}

// ── Consent ──
const POLICY_KIND: Record<ConsentPurpose, string> = {
  terms_privacy: 'terms',
  health_processing: 'health_consent',
  history_storage: 'privacy',
  email_comms: 'privacy',
  product_analytics: 'privacy',
  research_deidentified: 'privacy',
  ai_explanation: 'privacy'
};

export async function getMe(): Promise<{ eligible: boolean; consents: Partial<Record<ConsentPurpose, boolean>>; aiExplanation: boolean; firstName: string | null }> {
  const me = await request<{ eligible: boolean; consents: { purpose: ConsentPurpose; granted: boolean }[]; aiExplanation?: boolean; firstName?: string | null }>('GET', '/v1/me');
  return { eligible: me.eligible, consents: Object.fromEntries(me.consents.map(c => [c.purpose, c.granted])), aiExplanation: me.aiExplanation === true, firstName: me.firstName ?? null };
}

/** The name she would like to be called (optional); null removes it. */
export const saveFirstName = (firstName: string | null) => request<{ firstName: string | null }>('PUT', '/v1/me/name', { firstName });

/** Deletes the account and everything in it. The caller signs out afterwards. */
/** Everything PreConnix holds for this account, as one JSON document (Account → Your data). */
export const exportMyData = () => request<unknown>('GET', '/v1/me/export');
export const deleteAccount = () => request('DELETE', '/v1/me', { confirm: 'DELETE' });

/** Records the one agreement (Terms of Use and Privacy Policy, which cover 18+ and keeping results). */
export async function saveAgreement(platform: 'ios' | 'android') {
  await confirmEligibility();
  await saveConsents({ terms_privacy: true, health_processing: true, history_storage: true }, platform);
}

export async function confirmEligibility() {
  await request('POST', '/v1/me/eligibility', { confirmedAdult: true });
}

/** Records each choice as its own consent entry (append-only on the server). */
export async function saveConsents(choices: Partial<Record<ConsentPurpose, boolean>>, platform: 'ios' | 'android') {
  const policies = await request<{ items: { id: string; kind: string }[] }>('GET', '/v1/policies/current');
  for (const [purpose, granted] of Object.entries(choices) as [ConsentPurpose, boolean][]) {
    const doc = policies.items.find(p => p.kind === POLICY_KIND[purpose]);
    if (!doc) throw new ApiError(500, 'consent_document_missing');
    await request('POST', '/v1/me/consents', { purpose, granted, policyDocumentId: doc.id, source: platform });
  }
}

// ── Assessments ──
/** Sends a completed draft and returns the server's result. Consents must already be recorded. */
export async function submitAssessment(input: {
  profile: Record<string, string>;
  answers: Record<string, string>;
  followUps: Record<string, string[]>;
  followUpOther: Record<string, string>;
  numbers: Record<string, number>;
  definitionId: string;
  platform: 'ios' | 'android';
}): Promise<AssessmentResult> {
  await confirmEligibility();
  const created = await request<{ id: string }>('POST', '/v1/assessments', { clientPlatform: input.platform, definitionId: input.definitionId }, { 'idempotency-key': uuidV4() });
  await request('PUT', `/v1/assessments/${created.id}/profile`,
    Object.fromEntries(Object.entries(input.profile).map(([field, value]) => [field, `profile.${field}.${value}`])));
  await request('PUT', `/v1/assessments/${created.id}/answers`, {
    answers: Object.entries(input.answers).map(([questionId, optionId]) => ({ questionId, optionId })),
    followUps: input.followUps,
    followUpOther: input.followUpOther,
    numbers: input.numbers
  });
  return request<AssessmentResult>('POST', `/v1/assessments/${created.id}/submit`);
}

export async function listSavedAssessments(): Promise<AssessmentSummary[]> {
  const r = await request<{ items: AssessmentSummary[] }>('GET', '/v1/assessments');
  return r.items.filter(a => a.status === 'scored');
}

export const getResult = (id: string) => request<AssessmentResult>('GET', `/v1/assessments/${id}/result`);
/** Emails the saved report to the person's own sign-in address (they can forward it to their doctor). */
export const emailReport = (id: string) => request<{ sent: true }>('POST', `/v1/assessments/${id}/email`);

/** AI-assisted explanation of a saved result (ADR-018): checked on the server, never part of the report. */
export interface AiExplanation {
  label: string;
  createdAt: string;
  summary: string;
  areas: { code: string; explanation: string; askYourProvider: string[] }[];
}
export const getExplanation = (id: string) => request<AiExplanation>('GET', `/v1/assessments/${id}/explanation`);
export const createExplanation = (id: string) => request<AiExplanation>('POST', `/v1/assessments/${id}/explanation`);
export const deleteAssessment = (id: string) => request('DELETE', `/v1/assessments/${id}`);
export const deleteAllAssessments = () => request<{ deleted: number }>('DELETE', '/v1/assessments');

// ── Reproductive Life Plan ──
export type GoalCategory =
  | 'checkups_screening' | 'nutrition_supplements' | 'lifestyle' | 'mental_wellbeing' | 'relationships_support'
  | 'contraception_planning' | 'finances_housing' | 'learning' | 'other';
export type Intention = 'planning_now' | 'planning_later' | 'unsure' | 'not_planning' | 'prefer_not_say';
export type Horizon = 'within_1y' | '1_2y' | '3_5y' | '5y_plus' | 'not_sure';

export type Rhythm = 'once' | 'daily' | 'weekly' | 'monthly';
export type TargetUnit = 'km' | 'minutes' | 'days' | 'times';
export interface GoalTarget { amount: number; unit: TargetUnit }
export interface Checkin { day: string; amount: number | null }
import type { PlanDraft, SupportMessage } from '@preconnix/content';
export type { PlanDraft, SupportMessage };

export interface PlanAction { id: string; goalId: string; title: string; dueDate: string | null; done: boolean }
export interface PlanGoal {
  id: string;
  category: GoalCategory;
  title: string;
  notes: string | null;
  targetDate: string | null;
  status: 'open' | 'done' | 'archived';
  sourceDomain: string | null;
  rhythm: Rhythm;
  /** Weekly target the person set (repeating goals only). */
  target: GoalTarget | null;
  actions: PlanAction[];
  /** Recent check-ins, oldest first (repeating goals only). */
  checkins: Checkin[];
}
export type { FamilyPicture, SupportOption } from '@preconnix/content';

export interface Plan {
  /** The assessment her plan was last generated from. */
  sourceAssessmentId: string | null;
  /** The essentials her answers called for; null on older plans. */
  essentialsFocus: string[] | null;
  intention: Intention | null;
  horizon: Horizon | null;
  /** YYYY-MM-DD the person chose to review their plan. */
  reviewDate: string | null;
  /** The four set-up steps were finished once. */
  setupComplete: boolean;
  /** Plan guide (SOGC-style, for Nigeria): how she pictures her family, her support, essentials done, questions. */
  familyPicture: FamilyPicture | null;
  support: SupportOption[];
  essentialsDone: string[];
  providerQuestions: string[];
  goals: PlanGoal[];
}
export interface Dashboard {
  /** The name she chose in the app, else from sign-up. */
  firstName?: string | null;
  intention: Intention | null;
  horizon: Horizon | null;
  latestResult: null | {
    assessmentId: string; computedAt: string; country: string | null; pathway: AssessmentResult['pathway'];
    score: number; band: AssessmentResult['overall']['band']; bandLabel: string; support?: SupportMessage[];
    focus: { code: string; name: string; percent: number }[];
  };
  goals: { open: number; done: number };
  nextActions: (PlanAction & { goalTitle: string })[];
}

export const getPlan = () => request<Plan>('GET', '/v1/rlp');
export const getPlanDraft = () => request<PlanDraft>('GET', '/v1/rlp/draft');
export interface HealthDetails { heightCm: number | null; weightKg: number | null; gravida: number | null; parity: number | null; bmi: { value: number; label: string } | null; updatedAt: string | null }
export const getHealthDetails = () => request<HealthDetails>('GET', '/v1/me/health-details');
export const saveHealthDetails = (d: Pick<HealthDetails, 'heightCm' | 'weightKg' | 'gravida' | 'parity'>) => request<HealthDetails>('PUT', '/v1/me/health-details', d);
export const getDashboard = () => request<Dashboard>('GET', '/v1/dashboard');
export const updatePlan = (patch: {
  intention?: Intention | null; horizon?: Horizon | null; reviewDate?: string | null; setupComplete?: true;
  familyPicture?: FamilyPicture | null; support?: SupportOption[]; essentialsDone?: string[]; providerQuestions?: string[]; sourceAssessmentId?: string; essentialsFocus?: string[];
}) =>
  request<Omit<Plan, 'goals'>>('PATCH', '/v1/rlp', patch);
export const createGoal = (g: {
  category: GoalCategory; title: string; notes?: string | null; targetDate?: string | null; sourceDomain?: string;
  rhythm?: Rhythm; target?: GoalTarget | null;
}) => request<PlanGoal>('POST', '/v1/rlp/goals', g);
export const updateGoal = (id: string, patch: Partial<Pick<PlanGoal, 'category' | 'title' | 'notes' | 'targetDate' | 'status' | 'rhythm' | 'target'>>) =>
  request<PlanGoal>('PATCH', `/v1/rlp/goals/${id}`, patch);
/** Records today's (or another recent day's) check-in: done, or an amount in the goal's unit. */
export const checkIn = (goalId: string, day: string, amount: number | null = null) =>
  request<Checkin>('PUT', `/v1/rlp/goals/${goalId}/checkins/${day}`, { amount });
export const undoCheckIn = (goalId: string, day: string) => request('DELETE', `/v1/rlp/goals/${goalId}/checkins/${day}`);
export const deleteGoal = (id: string) => request('DELETE', `/v1/rlp/goals/${id}`);
export const addAction = (goalId: string, a: { title: string; dueDate?: string | null }) =>
  request<PlanAction>('POST', `/v1/rlp/goals/${goalId}/actions`, a);
export const updateAction = (id: string, patch: { title?: string; dueDate?: string | null; done?: boolean }) =>
  request<PlanAction>('PATCH', `/v1/rlp/actions/${id}`, patch);
export const deleteAction = (id: string) => request('DELETE', `/v1/rlp/actions/${id}`);

// ── Circle (weekly question, poll, moderated answers) ──
export interface CircleAnswer { id: string; handle: string; body: string; mine: boolean; status: 'pending' | 'approved'; createdAt: string }
export interface CircleQuestion {
  id: string;
  prompt: string;
  status: 'published' | 'closed';
  publishedAt: string | null;
  poll: { options: string[]; myVote: number | null; totals: number[] | null } | null;
  response: string | null;
  answers: CircleAnswer[];
}
export type ReportReason = 'harmful' | 'offensive' | 'spam' | 'personal_info' | 'other';

export const getCircleHandle = () => request<{ handle: string }>('GET', '/v1/circle/me');
export const getCurrentQuestion = () => request<CircleQuestion>('GET', '/v1/circle/current');
export const getCircleQuestion = (id: string) => request<CircleQuestion>('GET', `/v1/circle/questions/${id}`);
export const listCircleQuestions = () =>
  request<{ items: { id: string; prompt: string; status: string; publishedAt: string }[] }>('GET', '/v1/circle/questions');
export const voteInPoll = (id: string, option: number) => request<CircleQuestion>('POST', `/v1/circle/questions/${id}/vote`, { option });
export const postAnswer = (id: string, body: string) =>
  request<{ id: string; status: 'pending'; showSupport: boolean }>('POST', `/v1/circle/questions/${id}/answers`, { body });
export const reportAnswer = (id: string, reason: ReportReason) => request('POST', `/v1/circle/answers/${id}/report`, { reason });
export const blockHandle = (handle: string) => request('POST', '/v1/circle/blocks', { handle });
