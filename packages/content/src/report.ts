// Builds the one-page PDF report as HTML, printed on the phone with expo-print (ADR-015).
// Letter style, modelled on the owner's sample: score and band, three focus areas, next steps.
// No domain table, no scoring method, no AI text, name or email. Answers appear only as the notes Dr Gloria asked for.
// Shared by the app (printed on the phone with expo-print) and the API (website download, report email), so every
// copy of the report looks the same. Plain TypeScript.
import { BRAND_NAME, FLOURISH_REVERSED_SVG } from './brand.ts';
import { GUIDANCE, selectGuidance, type GuidanceContent } from './guidance.ts';
import type { ReportResult as AssessmentResult } from './reportTypes.ts';
import { PATHWAY_LABEL, SAFETY_TEXT } from './results.ts';
import { DEFAULT_SETTINGS } from './settings.ts';

export interface ReportOptions {
  /** Non-production builds mark every report as a synthetic test report. */
  testWatermark?: boolean;
  /** Locale for the date line, e.g. 'en-GB'. */
  locale?: string;
  /** Clinician-approved guidance (defaults to the bundled worksheet content). */
  guidance?: GuidanceContent;
  /** Booking link and the countries it is offered in (from the admin console's settings). */
  consultation?: { url: string; countries: string[] };
}

// One-on-one consultations are for people in Nigeria only; other reports show no booking link.

const IMPORTANT_NOTE =
  'This report is based on your self-reported answers. It is for information only and does not replace professional medical advice, diagnosis or treatment. Please discuss your results and next steps with a qualified healthcare provider.';

export function escapeHtml(value: unknown): string {
  return String(value ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

export function buildReportHtml(result: AssessmentResult, opts: ReportOptions): string {
  const g = selectGuidance(result, opts.guidance ?? GUIDANCE);
  const consultation = opts.consultation ?? { url: DEFAULT_SETTINGS.consultationUrl, countries: DEFAULT_SETTINGS.consultationCountries };
  const date = new Date(result.computedAt).toLocaleDateString(opts.locale ?? 'en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const score = Number(result.overall.score);

  const focus = g.focus
    .map((f, i) => `<div class="focus"><div class="fh">${i + 1}. ${escapeHtml(f.name)}</div><p>${escapeHtml(f.text)}${
      f.links.length ? ` <span class="links">Trusted source: ${f.links.map(l => `<a href="${escapeHtml(l.url)}">${escapeHtml(l.title)}</a>`).join(' · ')}</span>` : ''
    }</p></div>`)
    .join('');

  const testNotes = opts.testWatermark
    ? `<div class="test">SYNTHETIC TEST REPORT &middot; CLINICAL REVIEW PENDING &middot; NOT FOR MEDICAL USE</div>`
    : '';
  const pendingNote =
    opts.testWatermark && !g.approved
      ? '<p class="pending">Personal guidance for each focus area will appear here once our clinical team approves it.</p>'
      : '';
  const safety = result.safetyFlags.length
    ? `<div class="safety"><b>Your safety matters.</b> ${escapeHtml(SAFETY_TEXT)}</div>`
    : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>PreConnix Reproductive Health Score</title>
<style>
  @page { margin: 8mm 10mm; }
  * { box-sizing: border-box; }
  h1, h2, h3, .logo, .sub { text-wrap: balance; } p, li, div { text-wrap: pretty; }
  html, body { margin: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2D2438; font-size: 9.2pt; line-height: 1.34;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  /* On screen (the website's report view), show it as an A4 sheet on a grey desk; printing and PDFs are unchanged. */
  @media screen {
    html { background: #E9E4EE; }
    body { background: #fff; width: 100%; max-width: 210mm; min-height: 297mm; margin: 24px auto; padding: 8mm 10mm;
           box-shadow: 0 6px 28px rgba(45,36,56,0.16); border-radius: 2px; }
    @media (max-width: 220mm) { body { margin: 0 auto; box-shadow: none; } }
  }
  .head { background: linear-gradient(120deg, #1B1D3A 0%, #13315C 100%); color: #fff; text-align: center; padding: 12px 16px 10px; border-radius: 10px 10px 0 0; border-bottom: 4px solid #E84C6F; }
  .logo { display: inline-flex; align-items: center; gap: 8px; font-size: 20pt; font-weight: 800; letter-spacing: -0.3px; }
  .logo svg { width: 26px; height: 26px; }
  .sub { font-size: 9pt; letter-spacing: 2.6px; color: rgba(255,255,255,0.82); margin-top: 2px; }
  .rule { width: 46px; height: 3px; background: #E84C6F; margin: 6px auto 5px; border-radius: 2px; }
  .meta { font-size: 9pt; color: rgba(255,255,255,0.86); }
  .conf { text-align: center; font-size: 7.5pt; letter-spacing: 2.2px; color: #6E6280; background: #F7F5FA; padding: 6px; }
  .test { text-align: center; font-size: 7.5pt; font-weight: 700; letter-spacing: 1px; color: #fff; background: #5C3A91; padding: 4px; }
  .card { border: 1px solid #ECE7F2; border-radius: 10px; padding: 10px 14px 6px; margin-top: 8px; }
  .eyebrow { font-size: 8pt; font-weight: 700; letter-spacing: 2px; color: #C73A5A; text-transform: uppercase; padding-bottom: 6px; border-bottom: 1px solid #F1EEF5; margin-bottom: 8px; }
  .scoreline { display: flex; align-items: center; gap: 12px; margin-bottom: 6px; }
  .badge { flex: 0 0 auto; width: 64px; height: 64px; border-radius: 50%; border: 5px solid #E84C6F; display: flex; flex-direction: column; align-items: center; justify-content: center; }
  .badge b { font-size: 17pt; line-height: 1; }
  .badge small { font-size: 6pt; color: #6B5E7B; white-space: nowrap; }
  .scoreline p { margin: 0; }
  p { margin: 0 0 5px; }
  .h { font-size: 9pt; font-weight: 700; letter-spacing: 1.4px; text-transform: uppercase; color: #5C3A91; margin: 8px 0 3px; }
  .focus { margin-bottom: 4px; page-break-inside: avoid; }
  .fh { font-weight: 700; margin-bottom: 1px; }
  .links { font-size: 8pt; color: #5E5270; }
  .links a { color: #5C3A91; }
  .pending { font-style: italic; color: #6E6280; font-size: 9pt; }
  .safety { background: #2D2438; color: #fff; border-radius: 8px; padding: 7px 12px; margin-top: 8px; font-size: 9pt; }
  .bottom { display: flex; gap: 8px; margin-top: 8px; page-break-inside: avoid; }
  .note { flex: 1.25; background: #FFF8E6; border: 1px solid #F3D58A; border-left: 4px solid #E0A100; border-radius: 8px; padding: 7px 10px; color: #6B4A00; font-size: 8pt; }
  .note b { display: block; letter-spacing: 1px; margin-bottom: 2px; color: #7A5200; }
  .cta { flex: 1; background: linear-gradient(120deg, #1B1D3A 0%, #13315C 100%); color: #fff; border-radius: 8px; padding: 7px 10px; display: flex; flex-direction: column; justify-content: center; gap: 5px; }
  .cta div { font-size: 8pt; color: rgba(255,255,255,0.85); }
  .cta div b { display: block; color: #fff; font-size: 10pt; margin-bottom: 1px; }
  .cta a { align-self: flex-start; background: #E84C6F; color: #fff; text-decoration: none; font-weight: 700; font-size: 8.5pt; padding: 5px 10px; border-radius: 6px; }
  .foot { text-align: center; font-size: 7.5pt; color: #6E6280; margin-top: 6px; }
</style></head>
<body>
  <div class="head">
    <div class="logo">${FLOURISH_REVERSED_SVG}<span>${BRAND_NAME}</span></div>
    <div class="sub">REPRODUCTIVE HEALTH SCORE</div>
    <div class="rule"></div>
    <div class="meta">${escapeHtml(date)} &middot; ${escapeHtml(PATHWAY_LABEL[result.pathway])}</div>
  </div>
  <div class="conf">CONFIDENTIAL &mdash; PERSONAL HEALTH ASSESSMENT REPORT</div>
  ${testNotes}
  ${safety}
  <div class="card">
    <div class="eyebrow">Your personalised report</div>
    <div class="scoreline">
      <div class="badge"><b>${score}</b><small>out of 100</small></div>
      <p>Your Reproductive Health Score is <b>${score} out of 100</b>, placing you in the <b>${escapeHtml(result.overall.bandLabel)}</b> band.</p>
    </div>
    <p>${escapeHtml(g.opening)}</p>
    <div class="h">Your three focus areas</div>
    ${focus}
    ${pendingNote}
    ${result.notes?.length ? `<div class="h">From your answers</div>${result.notes.map(n => `<p>${escapeHtml(n)}</p>`).join('')}` : ''}
    <p>${escapeHtml(g.closing)}</p>
  </div>
  <div class="bottom">
  <div class="note"><b>&#9888; IMPORTANT NOTE</b>${escapeHtml(IMPORTANT_NOTE)}</div>
  ${consultation.countries.includes(result.country ?? '') ? `<div class="cta">
    <div><b>Want personalised guidance?</b>Book a one-on-one consultation to turn these insights into your personal action plan.</div>
    <a href="${escapeHtml(consultation.url)}">Book a consultation &rarr;</a>
  </div>` : ''}
  </div>
  <div class="foot">PreConnix Health Technologies &middot; preconnix.com &middot; hello@preconnix.com &middot; &copy; ${new Date(result.computedAt).getFullYear()}</div>
</body></html>`;
}

/** File name without personal data, e.g. PreConnix_Reproductive_Health_Score_2026-10-21.pdf */
export function reportFileName(result: AssessmentResult): string {
  return `PreConnix_Reproductive_Health_Score_${new Date(result.computedAt).toISOString().slice(0, 10)}.pdf`;
}
