// One-page PDF report content. Runs with node:test (no React Native needed).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { DEFAULT_SETTINGS, EMPTY_GUIDANCE } from '@preconnix/content';
import { buildReportHtml, escapeHtml, reportFileName } from '../src/features/report/reportHtml.ts';

const CONSULTATION_URL = DEFAULT_SETTINGS.consultationUrl;
import { GUIDANCE, guidanceProblems, selectGuidance, WORD_LIMITS, type GuidanceContent } from '../src/features/results/guidance.ts';
import type { AssessmentResult } from '../src/core/api.ts';

const base: AssessmentResult = {
  assessmentId: '00000000-0000-4000-8000-000000000001',
  saved: true,
  country: 'NG',
  pathway: 'general_wellness',
  definitionId: 'rra-defs-1.1',
  scoringPolicyId: 'rra-1.1.0',
  scoringStatus: 'legacy_unvalidated',
  overall: { score: 72, earned: 26, max: 36, band: 'moderate', bandLabel: 'Moderate' },
  domains: [
    { code: 'family_planning', name: 'Family Planning & Contraception', percent: 88, earned: 7, max: 8 },
    { code: 'physical_nutrition', name: 'Physical & Nutritional Health', percent: 50, earned: 2, max: 4 },
    { code: 'infectious_immunization', name: 'Infectious Diseases & Immunizations', percent: 25, earned: 1, max: 4 },
    { code: 'chronic_medications', name: 'Chronic Conditions & Medications', percent: 100, earned: 4, max: 4 },
    { code: 'substance_use', name: 'Substance Use', percent: 83, earned: 5, max: 6 },
    { code: 'reproductive_genetic', name: 'Reproductive & Genetic Risks', percent: 75, earned: 3, max: 4 },
    { code: 'mental_health_safety', name: 'Mental Health & Safety', percent: 50, earned: 3, max: 6 }
  ],
  safetyFlags: [],
  computedAt: '2026-10-21T10:00:00.000Z'
};

const approvedContent = (): GuidanceContent => {
  const c: GuidanceContent = JSON.parse(JSON.stringify(GUIDANCE));
  c.approved = true;
  for (const pw of ['pregnancy_planning', 'general_wellness'] as const) {
    for (const b of ['high', 'moderate', 'low'] as const) c.opening[pw][b] = `OPENING-${pw}-${b}`;
    c.closing[pw] = `CLOSING-${pw}`;
  }
  c.opening.general_wellness.moderate = 'OPENING-GW-MODERATE';
  c.closing.general_wellness = 'CLOSING-GW';
  for (const code of Object.keys(c.domain)) for (const l of ['strong', 'attention', 'priority'] as const) c.domain[code][l] = `DOMAIN-${code}-${l}`;
  return c;
};

test('report states score and band, and has no domain table or scoring method', () => {
  const html = buildReportHtml(base, { testWatermark: false, locale: 'en-GB' });
  assert.match(html, /Your Reproductive Health Score is <b>72 out of 100<\/b>, placing you in the <b>Moderate<\/b> band/);
  for (const s of ['General reproductive wellness', '21 October 2026', 'IMPORTANT NOTE', 'Want personalised guidance?']) assert.ok(html.includes(s), s);
  const body = html.replace(/<style>[\s\S]*?<\/style>/, '');
  assert.doesNotMatch(body, /<table|How this is calculated|earns 0, 1 or 2 points|88%|100%|domain breakdown/i);
});

test('three focus areas are the three lowest domains, ties in questionnaire order', () => {
  const g = selectGuidance(base);
  assert.deepEqual(g.focus.map(f => [f.code, f.level]), [
    ['infectious_immunization', 'priority'],
    ['physical_nutrition', 'attention'],
    ['mental_health_safety', 'attention']
  ]);
  const html = buildReportHtml(base, { testWatermark: false });
  assert.ok(html.indexOf('1. Infectious Diseases') < html.indexOf('2. Physical &amp; Nutritional') && html.indexOf('2. Physical') < html.indexOf('3. Mental Health'));
});

test('without approved worksheet text, approved website wording and a neutral next step are used', () => {
  const g = selectGuidance(base, EMPTY_GUIDANCE);
  assert.equal(g.approved, false);
  assert.match(g.opening, /^Your score suggests moderate reproductive health/);
  assert.ok(g.focus.every(f => f.text === 'Talk with your healthcare provider about this area at your next visit.'));
  assert.match(buildReportHtml(base, { testWatermark: true, guidance: EMPTY_GUIDANCE }), /will appear here once our clinical team approves it/);
});

test('approved worksheet text is used once approved, and ignored while not approved', () => {
  const c = approvedContent();
  const html = buildReportHtml(base, { testWatermark: true, guidance: c });
  for (const s of ['OPENING-GW-MODERATE', 'DOMAIN-infectious_immunization-priority', 'DOMAIN-physical_nutrition-attention', 'DOMAIN-mental_health_safety-attention', 'CLOSING-GW']) assert.ok(html.includes(s), s);
  assert.doesNotMatch(html, /will appear here once/);
  assert.doesNotMatch(buildReportHtml(base, { testWatermark: false, guidance: { ...c, approved: false } }), /DOMAIN-|OPENING-GW/);
});

test('test builds carry the synthetic watermark; production builds do not', () => {
  assert.match(buildReportHtml(base, { testWatermark: true }), /SYNTHETIC TEST REPORT/);
  assert.doesNotMatch(buildReportHtml(base, { testWatermark: false }), /SYNTHETIC TEST REPORT/);
});

test('safety section appears only when the server raised a safety flag', () => {
  assert.doesNotMatch(buildReportHtml(base, { testWatermark: false }), /Your safety matters/);
  assert.match(buildReportHtml({ ...base, safetyFlags: [{ code: 'relationship_safety' }] }, { testWatermark: false }), /Your safety matters/);
});

test('text is escaped; the only links are PreConnix and approved trusted sources; no ids or scripts', () => {
  const evil = { ...base, domains: base.domains.map((d, i) => (i === 2 ? { ...d, name: '<img src=x onerror=alert(1)>' } : d)) };
  const html = buildReportHtml(evil, { testWatermark: false, guidance: EMPTY_GUIDANCE });
  assert.doesNotMatch(html, /<img src=x|<script/i);
  assert.match(html, /&lt;img src=x/);
  assert.deepEqual([...html.matchAll(/href="([^"]+)"/g)].map(m => m[1]), [CONSULTATION_URL]);
  assert.doesNotMatch(html, new RegExp(base.assessmentId));
  assert.equal(escapeHtml(`"'<>&`), '&quot;&#39;&lt;&gt;&amp;');
  assert.equal(reportFileName(base), 'PreConnix_Reproductive_Health_Score_2026-10-21.pdf');
});

test('approved guidance must fit the one-page word limits', () => {
  const ok = approvedContent();
  assert.deepEqual(guidanceProblems(ok), []);
  const tooLong = approvedContent();
  tooLong.domain.substance_use.priority = Array(WORD_LIMITS.focus + 1).fill('word').join(' ');
  tooLong.closing.pregnancy_planning = '';
  assert.deepEqual(guidanceProblems(tooLong), ['closing.pregnancy_planning: missing', `domain.substance_use.priority: ${WORD_LIMITS.focus + 1} words (max ${WORD_LIMITS.focus})`]);
});

test('the bundled guidance is either not yet approved, or complete and within limits', () => {
  if (GUIDANCE.approved) assert.deepEqual(guidanceProblems(GUIDANCE), []);
});

test('the consultation booking link appears for people in Nigeria', () => {
  assert.match(buildReportHtml(base, { testWatermark: false }), /Book a consultation/);
  assert.doesNotMatch(buildReportHtml({ ...base, country: 'CA' }, { testWatermark: false }), /Book a consultation/);
});

test('booking link and countries come from the admin settings', () => {
  const html = buildReportHtml({ ...base, country: 'CA' }, { testWatermark: false, consultation: { url: 'https://example.com/book?a=1&b=2', countries: ['CA'] } });
  assert.ok(html.includes('href="https://example.com/book?a=1&amp;b=2"'));
  assert.doesNotMatch(buildReportHtml(base, { testWatermark: false, guidance: EMPTY_GUIDANCE, consultation: { url: 'https://example.com/book', countries: ['CA'] } }), /Book a consultation/);
});

test('approved trusted links are Nigerian or WHO sources for everyone (Nigeria-only, 5 Nov 2026)', () => {
  const ng = buildReportHtml(base, { testWatermark: false });
  assert.ok(ng.includes('Trusted source: <a href="https://www.who.int/news-room/commentaries/detail/health-workers-listening-when-women-need-it-most">'));
  const ca = buildReportHtml({ ...base, country: 'CA' }, { testWatermark: false });
  assert.match(ca, /who\.int/);
  assert.doesNotMatch(ng + ca, /canada\.ca/);
});

test('the bundled worksheet is approved and names the report the Reproductive Health Score', () => {
  assert.equal(GUIDANCE.approved, true);
  const all = JSON.stringify(GUIDANCE);
  assert.doesNotMatch(all, /PreConnix report/);
  assert.match(buildReportHtml(base, { testWatermark: false }), /REPRODUCTIVE HEALTH SCORE/);
});
