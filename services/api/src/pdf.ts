// PDF of the report for email attachments (owner, 1 Nov 2026): the shared report HTML (packages/content
// report.ts) printed by headless Chromium, so the attachment matches the app's and the website's report exactly.
// The page gets our own escaped HTML only: JavaScript is off and every network request is blocked.
import puppeteer from 'puppeteer-core';

export interface PdfRenderer { render(html: string): Promise<Buffer> }

export function chromiumRenderer(executablePath: string): PdfRenderer {
  return {
    async render(html) {
      const browser = await puppeteer.launch({
        executablePath,
        headless: true,
        // Containers have no user namespaces for Chromium's sandbox; the page runs no script and loads nothing.
        args: ['--no-sandbox', '--disable-dev-shm-usage', '--disable-gpu', '--no-first-run', '--disable-extensions']
      });
      try {
        const page = await browser.newPage();
        await page.setJavaScriptEnabled(false);
        await page.setRequestInterception(true);
        page.on('request', r => (r.isNavigationRequest() && r.url() === 'about:blank' ? r.continue() : r.abort()));
        await page.setContent(html, { waitUntil: 'load' });
        return Buffer.from(await page.pdf({ format: 'A4', printBackground: true, preferCSSPageSize: true }));
      } finally {
        await browser.close();
      }
    }
  };
}
