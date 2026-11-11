// Report emails (BE-18, ADR-017): Azure Communication Services in Canada, signed in with the API's managed identity.
// The message goes only to the member's own sign-in address; they forward it to their doctor if they wish.
// Addresses and message bodies are never logged.
import { EmailClient } from '@azure/communication-email';
import type { ScoreResult } from '@preconnix/assessment-engine';
import { BRAND_NAME, DISCLAIMER, LEGACY_BAND_TEXT, levelWord } from '@preconnix/content';

export interface MailAttachment { name: string; contentType: string; contentInBase64: string }
export interface MailMessage { to: string; subject: string; html: string; text: string; attachments?: MailAttachment[] }
export interface Mailer { send(message: MailMessage): Promise<void> }

export function azureMailer(endpoint: string, from: string, credential: ConstructorParameters<typeof EmailClient>[1]): Mailer {
  const client = new EmailClient(endpoint, credential as never);
  return {
    async send(m) {
      const poller = await client.beginSend({
        senderAddress: from,
        recipients: { to: [{ address: m.to }] },
        content: { subject: m.subject, html: m.html, plainText: m.text },
        ...(m.attachments?.length ? { attachments: m.attachments } : {})
      });
      const done = await poller.pollUntilDone();
      if (done.status !== 'Succeeded') throw new Error('email_not_sent');
    }
  };
}

const esc = (s: string) => s.replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]!));
const BAND_COLOUR = { high: '#11704F', moderate: '#8A5300', low: '#A11F1F' } as const;

// ── Letters (approved by the owner and Dr Gloria, 1 Nov 2026) ──
export const APP_PAGE = 'https://preconnix.com/app/';

const APP_PARAGRAPH = 'Your email address is also your sign-in for the PreConnix app. Sign in with it to see your results, build your Reproductive Life Plan with goals and gentle check-ins, take short lessons and join our community Circle.';

const WELCOME = {
  subject: 'Welcome to PreConnix: your Reproductive Health Score',
  paragraphs: [
    'Hello,',
    'Thank you for taking the PreConnix Reproductive Health Assessment. Your personal report is attached to this email.',
    'Understanding your health before pregnancy is one of the most caring things you can do for yourself and your future family. Please read your report and share it with your doctor, so you can talk through your results together.'
  ],
  closing: 'I warmly invite you to join the PreConnix community, where you will meet others on the same path, and I would love to connect with you along your journey. I am ready and excited to walk this path with you, as I have with so many others.',
  signOff: ['Warm regards,', 'Dr Gloria Williams-Aborishade', 'Co-founder – Chief Medical Officer', 'PreConnix']
};

const REPORT = {
  subject: 'Your PreConnix Reproductive Health Score',
  paragraphs: ['Hello,', 'Your Reproductive Health Score is attached to this email. You can forward it to your doctor to talk through your results.'],
  closing: null,
  signOff: ['The PreConnix team']
};

/**
 * The email that carries the report PDF: the welcome letter from Dr Gloria the first time, the short report email after.
 * Only an assessment taken on the website is pointed to the app (owner, 9 Nov 2026). Without a PDF (no renderer, e.g. local), the breakdown is written into the email instead.
 */
export function letterEmail(kind: 'welcome' | 'report', withAttachment: boolean, r: ScoreResult, computedAt: string, firstName?: string, fromWebsite = false): Omit<MailMessage, 'to' | 'attachments'> {
  const base: { subject: string; paragraphs: string[]; closing: string | null; signOff: string[] } = kind === 'welcome' ? WELCOME : REPORT;
  // "Hello Ada," when sign-up gave a first name; otherwise "Hello,".
  const t = { ...base, paragraphs: base.paragraphs.map((p, i) => (i === 0 && firstName ? `Hello ${firstName},` : p)) };
  const inline = withAttachment ? null : reportEmail(r, computedAt);
  const paras = withAttachment ? t.paragraphs : [...t.paragraphs.slice(0, 1), 'Your Reproductive Health Score is below.'];
  const p = (x: string) => `<p style="font-size:15px;line-height:1.6;margin:0 0 14px">${esc(x)}</p>`;
  const html = `<!doctype html><html><body style="margin:0;background:#FFFAF9;font-family:Helvetica,Arial,sans-serif;color:#2D2438">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:22px;font-weight:800;color:#2D2438;margin-bottom:24px">${BRAND_NAME}</div>
${paras.map(p).join('\n')}
${inline ? inline.html.replace(/^[\s\S]*?<h1/, '<h1').replace(/<\/div><\/body><\/html>$/, '') : ''}
${fromWebsite ? `<div style="background:#F3EEF9;border-radius:14px;padding:16px 18px;margin:20px 0">
<p style="font-size:15px;line-height:1.6;margin:0 0 12px">${esc(APP_PARAGRAPH)}</p>
<a href="${APP_PAGE}" style="display:inline-block;background:#C73A5A;color:#fff;text-decoration:none;font-weight:700;padding:12px 20px;border-radius:12px">Get the PreConnix app</a>
</div>` : ''}
${t.closing ? p(t.closing) : ''}
${t.signOff.map((x, i) => `<p style="font-size:15px;line-height:1.4;margin:0${i === 0 ? ' 0 4px' : ''}">${i === 1 ? `<b>${esc(x)}</b>` : esc(x)}</p>`).join('\n')}
<p style="font-size:12px;line-height:1.6;color:#6B5E7B;margin-top:28px">${esc(DISCLAIMER)}</p>
</div></body></html>`;
  const text = [...paras, ...(inline ? ['', inline.text] : []), ...(fromWebsite ? ['', APP_PARAGRAPH, `Get the PreConnix app: ${APP_PAGE}`] : []), '', ...(t.closing ? [t.closing, ''] : []), ...t.signOff, '', DISCLAIMER].join('\n');
  return { subject: t.subject, html, text };
}

/** The detailed report written into an email (used when no PDF can be attached): score, band, domains, disclaimer. */
export function reportEmail(r: ScoreResult, computedAt: string): Omit<MailMessage, 'to'> {
  const date = new Date(computedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'UTC' });
  const band = r.overall.band as keyof typeof LEGACY_BAND_TEXT;
  const rows = r.domains.map(d => `<tr><td style="padding:8px 0;border-bottom:1px solid #E8E0ED">${esc(d.name)}</td><td style="padding:8px 0;border-bottom:1px solid #E8E0ED;text-align:right;white-space:nowrap"><b>${d.percent}%</b> · ${levelWord(d.percent)}</td></tr>`).join('');
  const html = `<!doctype html><html><body style="margin:0;background:#FFFAF9;font-family:Helvetica,Arial,sans-serif;color:#2D2438">
<div style="max-width:560px;margin:0 auto;padding:28px 20px">
<div style="font-size:22px;font-weight:800;color:#2D2438">${BRAND_NAME}</div>
<h1 style="font-size:22px;margin:24px 0 4px">Your Reproductive Health Score</h1>
<div style="color:#6B5E7B;font-size:13px">${esc(date)}</div>
<div style="font-size:44px;font-weight:800;margin:18px 0 0">${r.overall.score}<span style="font-size:18px;color:#6B5E7B">/100</span></div>
<div style="font-weight:700;color:${BAND_COLOUR[band]};margin:4px 0 12px">${esc(r.overall.bandLabel)}</div>
<p style="font-size:14px;line-height:1.6">${esc(LEGACY_BAND_TEXT[band])}</p>
<h2 style="font-size:16px;margin:24px 0 4px">Domain breakdown</h2>
<table style="width:100%;border-collapse:collapse;font-size:14px">${rows}</table>
<p style="font-size:14px;line-height:1.6;margin-top:24px">You can forward this email to your doctor to talk through your results.</p>
<p style="font-size:12px;line-height:1.6;color:#6B5E7B;margin-top:24px">${esc(DISCLAIMER)}</p>
</div></body></html>`;
  const text = [
    'Your Reproductive Health Score', date, '',
    `Score: ${r.overall.score}/100 (${r.overall.bandLabel})`, LEGACY_BAND_TEXT[band], '',
    'Domain breakdown:', ...r.domains.map(d => `- ${d.name}: ${d.percent}% (${levelWord(d.percent)})`), '',
    'You can forward this email to your doctor to talk through your results.', '', DISCLAIMER
  ].join('\n');
  return { subject: 'Your PreConnix Reproductive Health Score', html, text };
}
