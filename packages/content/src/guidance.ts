// Personal guidance for the report: opening, three focus areas, closing, and trusted links.
// Text comes ONLY from the clinician-approved "RRA Report Content Worksheet" (guidanceText.ts, approved
// 1 Nov 2026). No AI text and nothing invented here (ADR-006). If a paragraph were ever missing, the approved
// website wording and a neutral next step are used instead.
// Shared by the app (PDF on the phone) and the API (website download, report email). Plain data.
import { LEGACY_BAND_TEXT } from './results.ts';
import type { ReportResult as AssessmentResult } from './reportTypes.ts';
import { CLOSING, DOMAIN, LINKS, OPENING } from './guidanceText.ts';

type Band = AssessmentResult['overall']['band'];
type Pathway = AssessmentResult['pathway'];
export type Level = 'strong' | 'attention' | 'priority';

export interface TrustedLink { title: string; url: string }

export interface GuidanceContent {
  approved: boolean;
  opening: Record<Pathway, Record<Band, string>>;
  domain: Record<string, Record<Level, string>>;
  closing: Record<Pathway, string>;
  /** Country code → domain code → approved links (https only). */
  links?: Record<string, Record<string, TrustedLink[]>>;
}

const blankLevels = () => ({ strong: '', attention: '', priority: '' });

/** Empty content, as used before approval (tests use it to check the fallbacks). */
export const EMPTY_GUIDANCE: GuidanceContent = {
  approved: false,
  opening: {
    pregnancy_planning: { high: '', moderate: '', low: '' },
    general_wellness: { high: '', moderate: '', low: '' }
  },
  domain: Object.fromEntries(
    [
      'demographics_timing', 'obstetric_history', 'physical_medical', 'sexual_substance', 'mental_social_env',
      'family_planning', 'physical_nutrition', 'infectious_immunization', 'chronic_medications', 'substance_use',
      'reproductive_genetic', 'mental_health_safety'
    ].map(code => [code, blankLevels()])
  ),
  closing: { pregnancy_planning: '', general_wellness: '' }
};

/** The approved worksheet (guidanceText.ts). */
export const GUIDANCE: GuidanceContent = { approved: true, opening: OPENING, domain: DOMAIN, closing: CLOSING, links: LINKS };

// Approved wording used until the worksheet is signed: the website's band text, and the closing
// sentence from Dr Gloria's existing report letter.
const FALLBACK_FOCUS = 'Talk with your healthcare provider about this area at your next visit.';
const FALLBACK_CLOSING = 'Please share these results with your healthcare provider to plan your next steps together.';

/** Word limits that keep the PDF report on one page. The approved worksheet's longest paragraphs, with the safety
 * notice and test stamp, were checked with Chrome at A4 on 1 Nov 2026. */
export const WORD_LIMITS = { opening: 95, focus: 95, closing: 95 } as const;

const wordCount = (s: string) => s.trim().split(/\s+/).filter(Boolean).length;

/** Lists approved paragraphs that are missing or too long for a one-page report. */
export function guidanceProblems(content: GuidanceContent): string[] {
  const problems: string[] = [];
  const check = (key: string, text: string | undefined, max: number) => {
    if (!filled(text)) problems.push(`${key}: missing`);
    else if (wordCount(text) > max) problems.push(`${key}: ${wordCount(text)} words (max ${max})`);
  };
  for (const pw of ['pregnancy_planning', 'general_wellness'] as const) {
    for (const b of ['high', 'moderate', 'low'] as const) check(`opening.${pw}.${b}`, content.opening[pw][b], WORD_LIMITS.opening);
    check(`closing.${pw}`, content.closing[pw], WORD_LIMITS.closing);
  }
  for (const [code, levels] of Object.entries(content.domain)) {
    for (const l of ['strong', 'attention', 'priority'] as const) check(`domain.${code}.${l}`, levels[l], WORD_LIMITS.focus);
  }
  return problems;
}

export const levelFor = (pct: number): Level => (pct >= 75 ? 'strong' : pct >= 50 ? 'attention' : 'priority');

export interface FocusArea {
  code: string;
  name: string;
  level: Level;
  text: string;
  /** Approved trusted links for the person's country and this area (https only). */
  links: TrustedLink[];
}

export interface Guidance {
  approved: boolean;
  opening: string;
  focus: FocusArea[];
  closing: string;
}

const filled = (s: string | undefined): s is string => typeof s === 'string' && s.trim().length > 0;

/** The three lowest-scoring domains (ties keep questionnaire order), with approved text when available. */
export function selectGuidance(result: AssessmentResult, content: GuidanceContent = GUIDANCE): Guidance {
  const usable = content.approved;
  const lowest = result.domains
    .map((d, order) => ({ ...d, order }))
    .sort((a, b) => a.percent - b.percent || a.order - b.order)
    .slice(0, 3);

  const opening = content.opening[result.pathway]?.[result.overall.band];
  const closing = content.closing[result.pathway];
  return {
    approved: usable,
    // The website's moderate text points to a domain breakdown, which the one-page report doesn't have.
    opening: usable && filled(opening) ? opening : LEGACY_BAND_TEXT[result.overall.band].replace(/\s*Review your domain breakdown below[^.]*\./, ''),
    focus: lowest.map(d => {
      const level = levelFor(d.percent);
      const text = content.domain[d.code]?.[level];
      const links = usable ? (content.links?.NG?.[d.code] ?? []).filter(l => l.url.startsWith('https://')) : [];
      return { code: d.code, name: d.name, level, text: usable && filled(text) ? text : FALLBACK_FOCUS, links };
    }),
    closing: usable && filled(closing) ? closing : FALLBACK_CLOSING
  };
}
