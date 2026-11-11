// "My Reproductive Life Plan" as a shareable PDF. Since 5 Nov 2026 (Dr Gloria) it is a one-page visual board, not a
// form to fill in: her score, her path, her focus areas, her goals as cards, her essentials and vaccines as ticks,
// her support and at most three questions for her provider. Icons and short labels instead of paragraphs.
// It holds only her own choices and results, plus the name she chose (optional). Printed on the phone.
import { BRAND_NAME, FLOURISH_REVERSED_SVG } from './brand.ts';
import { escapeHtml } from './report.ts';

/** Inner SVG of an outline icon (24×24 viewBox, stroke drawn by the PDF). */
type IconSvg = string;

export interface PlanDocument {
  /** Date the PDF was made, already formatted, e.g. "5 November 2026". */
  date: string;
  /** The name she chose in the app, if any. */
  name?: string | null;
  /** Planning a pregnancy (now, later or not sure), or not planning one. */
  path: 'pregnancy' | 'health';
  pathIcon: IconSvg;
  /** Her plan in short phrases, e.g. ["Planning a pregnancy now", "Within 1 year"]. */
  plan: string[];
  result?: {
    score: number; band: 'high' | 'moderate' | 'low'; bandLabel: string;
    areas: { name: string; percent: number; level: string; icon: IconSvg }[];
  };
  goals: { title: string; how: string; by?: string | null; done: boolean; icon: IconSvg }[];
  essentials: { title: string; done: boolean; icon: IconSvg }[];
  vaccines: { name: string; done: boolean }[];
  support: string[];
  supportIcon: IconSvg;
  questions: string[];
  reviewDate?: string | null;
}

const e = escapeHtml;
const icon = (svg: IconSvg, size = 18) =>
  `<svg viewBox="0 0 24 24" width="${size}" height="${size}" fill="none" stroke="currentColor" stroke-width="1.9" stroke-linecap="round" stroke-linejoin="round">${svg}</svg>`;
const TICK = '<path d="m5 12 4 4L19 6"/>';
const BAND_COLOUR = { high: '#2EAD82', moderate: '#E0A21B', low: '#E84C6F' } as const;
const levelColour = (percent: number) => (percent >= 75 ? BAND_COLOUR.high : percent >= 50 ? BAND_COLOUR.moderate : BAND_COLOUR.low);

function ring(score: number, colour: string): string {
  const r = 34, c = 2 * Math.PI * r, filled = (Math.max(0, Math.min(100, score)) / 100) * c;
  return `<svg viewBox="0 0 84 84" width="84" height="84"><circle cx="42" cy="42" r="${r}" fill="none" stroke="#EEE8F5" stroke-width="9"/>
<circle cx="42" cy="42" r="${r}" fill="none" stroke="${colour}" stroke-width="9" stroke-linecap="round" stroke-dasharray="${filled.toFixed(1)} ${c.toFixed(1)}" transform="rotate(-90 42 42)"/>
<text x="42" y="46" text-anchor="middle" font-size="22" font-weight="800" fill="#2D2438">${score}</text><text x="42" y="60" text-anchor="middle" font-size="7.5" fill="#6B5E7B">out of 100</text></svg>`;
}

const card = (title: string, body: string, cls = '') => `<div class="card ${cls}"><div class="ct">${e(title)}</div>${body}</div>`;

export function buildPlanHtml(doc: PlanDocument): string {
  const r = doc.result;
  const owner = doc.name ? `${e(doc.name)}’s plan` : 'My plan';

  const hero = `<div class="hero">
    ${r ? card('Reproductive Health Score', `<div class="score">${ring(r.score, BAND_COLOUR[r.band])}<div><div class="band" style="background:${BAND_COLOUR[r.band]}">${e(r.bandLabel)}</div><div class="small">My plan starts with my focus areas.</div></div></div>`, 'scorecard') : ''}
    ${card(doc.path === 'pregnancy' ? 'My path: getting ready for pregnancy' : 'My path: caring for my reproductive health', `<div class="path"><div class="bigicon">${icon(doc.pathIcon, 30)}</div><div>${
      doc.plan.length ? doc.plan.map(p => `<span class="pill">${e(p)}</span>`).join('') : '<span class="pill">My plans can change</span>'
    }${doc.reviewDate ? `<div class="small">Review on <b>${e(doc.reviewDate)}</b></div>` : ''}</div></div>`, 'pathcard')}
  </div>`;

  const areas = r?.areas.length ? card('My focus areas', `<div class="areas">${r.areas.map(a => `
    <div class="area"><div class="ai" style="color:${levelColour(a.percent)};background:${levelColour(a.percent)}1A">${icon(a.icon, 20)}</div>
      <div class="an">${e(a.name)}</div>
      <div class="bar"><span style="width:${Math.max(4, a.percent)}%;background:${levelColour(a.percent)}"></span></div>
      <div class="small">${a.percent}% · ${e(a.level)}</div></div>`).join('')}</div>`) : '';

  const goals = card('My goals', doc.goals.length ? `<div class="goals">${doc.goals.map(g => `
    <div class="goal${g.done ? ' done' : ''}"><div class="gi">${icon(g.done ? TICK : g.icon, 18)}</div>
      <div class="gt">${e(g.title)}</div>
      <div class="gm"><span class="how">${e(g.how)}</span>${g.by ? `<span class="by">by ${e(g.by)}</span>` : ''}</div></div>`).join('')}</div>`
    : '<div class="small">I will choose my first goals in the app.</div>');

  const essentials = doc.essentials.length ? card('Health essentials', `<div class="ess">${doc.essentials.map(x => `
    <div class="es${x.done ? ' on' : ''}"><span class="ei">${icon(x.done ? TICK : x.icon, 14)}</span>${e(x.title)}</div>`).join('')}</div>`) : '';

  const vaccines = doc.vaccines.length ? card('My vaccines', `<div class="vax">${doc.vaccines.map(v => `
    <span class="vx${v.done ? ' on' : ''}">${v.done ? icon(TICK, 12) : '<span class="ring"></span>'}${e(v.name)}</span>`).join('')}</div>`, 'vaxcard') : '';

  const support = card('My support', doc.support.length
    ? `<div class="sup">${doc.support.map(s => `<span class="pill rose">${icon(doc.supportIcon, 12)}${e(s)}</span>`).join('')}</div>`
    : '<div class="small">I can add the people who support me in the app.</div>');

  const qs = doc.questions.slice(0, 3);
  const questions = qs.length ? card('Ask my provider', `<ul class="qs">${qs.map(q => `<li>${e(q)}</li>`).join('')}</ul>`, 'qcard') : '';

  return `<!DOCTYPE html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1">
<title>My Reproductive Life Plan</title>
<style>
  @page { margin: 9mm 10mm; }
  * { box-sizing: border-box; }
  html, body { margin: 0; }
  body { font-family: -apple-system, 'Helvetica Neue', Helvetica, Arial, sans-serif; color: #2D2438; font-size: 9.5pt; line-height: 1.35;
         -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  .head { background: linear-gradient(120deg, #1B1D3A 0%, #13315C 100%); color: #fff; padding: 14px 18px; border-radius: 14px; border-bottom: 4px solid #E84C6F; display: flex; align-items: center; justify-content: space-between; gap: 12px; }
  .logo { display: inline-flex; align-items: center; gap: 7px; font-size: 12pt; font-weight: 800; }
  .logo svg { width: 20px; height: 20px; }
  .title { font-size: 19pt; font-weight: 800; letter-spacing: -0.3px; margin-top: 4px; }
  .meta { text-align: right; font-size: 9pt; color: rgba(255,255,255,0.85); } .meta b { display: block; font-size: 12pt; color: #fff; }
  .card { background: #fff; border: 1px solid #ECE6F3; border-radius: 14px; padding: 10px 12px; margin-top: 10px; break-inside: avoid; }
  .ct { font-size: 8pt; font-weight: 800; letter-spacing: 1.1px; text-transform: uppercase; color: #5C3A91; margin-bottom: 8px; }
  .small { font-size: 8.5pt; color: #6B5E7B; margin-top: 4px; }
  .hero { display: grid; grid-template-columns: 1fr 1.25fr; gap: 10px; }
  .hero .card { margin-top: 10px; }
  .score { display: flex; align-items: center; gap: 12px; }
  .band { display: inline-block; color: #fff; font-weight: 800; border-radius: 999px; padding: 3px 12px; font-size: 10pt; }
  .path { display: flex; gap: 12px; align-items: flex-start; }
  .bigicon { flex: 0 0 auto; width: 52px; height: 52px; border-radius: 14px; background: #FDEEF2; color: #C73A5A; display: flex; align-items: center; justify-content: center; }
  .pill { display: inline-flex; align-items: center; gap: 5px; background: #F3EEF9; color: #3D2366; border-radius: 999px; padding: 3px 10px; margin: 0 5px 5px 0; font-weight: 600; font-size: 9pt; }
  .pill.rose { background: #FDEEF2; color: #8E2440; }
  .areas { display: grid; grid-template-columns: repeat(3, 1fr); gap: 10px; }
  .area { background: #FBF9FD; border-radius: 12px; padding: 8px 10px; }
  .ai { width: 34px; height: 34px; border-radius: 10px; display: flex; align-items: center; justify-content: center; margin-bottom: 5px; }
  .an { font-weight: 700; font-size: 9pt; min-height: 24px; }
  .bar { height: 7px; background: #EEE8F5; border-radius: 999px; overflow: hidden; margin-top: 5px; } .bar span { display: block; height: 100%; border-radius: 999px; }
  .goals { display: grid; grid-template-columns: repeat(3, 1fr); gap: 8px; }
  .goal { border: 1px solid #ECE6F3; border-radius: 12px; padding: 8px 10px; background: #FFFAF9; }
  .goal.done { background: #EDF7F2; border-color: #BFE5D5; }
  .gi { width: 30px; height: 30px; border-radius: 9px; background: #F3EEF9; color: #5C3A91; display: flex; align-items: center; justify-content: center; margin-bottom: 5px; }
  .goal.done .gi { background: #2EAD82; color: #fff; }
  .gt { font-weight: 700; font-size: 9pt; }
  .gm { margin-top: 4px; display: flex; flex-wrap: wrap; gap: 4px; }
  .how { background: #5C3A91; color: #fff; border-radius: 999px; padding: 1px 8px; font-size: 7.5pt; font-weight: 700; }
  .by { color: #6B5E7B; font-size: 7.5pt; padding: 1px 2px; }
  .row2 { display: grid; grid-template-columns: 1.35fr 1fr; gap: 10px; }
  .ess { display: grid; grid-template-columns: 1fr 1fr; gap: 5px 10px; }
  .es { display: flex; align-items: center; gap: 6px; font-size: 8.5pt; color: #4A3F57; }
  .ei { flex: 0 0 auto; width: 22px; height: 22px; border-radius: 7px; background: #F3EEF9; color: #7B4FBF; display: inline-flex; align-items: center; justify-content: center; }
  .es.on { color: #2D2438; font-weight: 600; } .es.on .ei { background: #2EAD82; color: #fff; }
  .vax { display: flex; flex-wrap: wrap; gap: 5px; }
  .vx { display: inline-flex; align-items: center; gap: 5px; border: 1px solid #DCD3E8; border-radius: 999px; padding: 3px 9px; font-size: 8.5pt; font-weight: 600; }
  .vx.on { background: #2EAD82; border-color: #2EAD82; color: #fff; }
  .ring { width: 10px; height: 10px; border: 1.5px solid #9A8DAE; border-radius: 50%; display: inline-block; }
  .qs { margin: 0; padding-left: 16px; } .qs li { margin: 2px 0; }
  .foot { margin-top: 12px; padding-top: 7px; border-top: 1px solid #ECE7F2; font-size: 7.5pt; color: #6E6280; display: flex; justify-content: space-between; gap: 12px; }
</style></head>
<body>
  <div class="head">
    <div><div class="logo">${FLOURISH_REVERSED_SVG}<span>${BRAND_NAME}</span></div><div class="title">My Reproductive Life Plan</div></div>
    <div class="meta"><b>${owner}</b>${e(doc.date)}</div>
  </div>
  ${hero}
  ${areas}
  ${goals}
  ${essentials || vaccines ? `<div class="row2">${essentials}${vaccines}</div>` : ''}
  ${questions ? `<div class="row2">${support}${questions}</div>` : support}
  <div class="foot">
    <span>My plan can change. I can update it in the PreConnix app at any time.</span>
    <span>Based on my own answers. It does not replace advice from my healthcare provider.</span>
  </div>
</body></html>`;
}

/** File name without personal data, e.g. PreConnix_My_Reproductive_Life_Plan_2026-11-04.pdf */
export const planFileName = (isoDate: string) => `PreConnix_My_Reproductive_Life_Plan_${isoDate}.pdf`;
