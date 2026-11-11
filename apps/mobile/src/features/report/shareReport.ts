// Prints the report to a PDF on the phone and opens the system share sheet (ADR-015).
// Nothing is uploaded: the PDF exists only in the app's cache until the next report replaces it.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import type { AssessmentResult } from '@/core/api';
import { cached } from '@/features/content/store';
import { buildReportHtml, reportFileName } from './reportHtml';

/** Which step failed, for diagnosis in test builds. Never contains health data. */
export class ReportError extends Error {
  step: string;
  constructor(step: string, cause: unknown) {
    super(cause instanceof Error ? cause.message : String(cause));
    this.step = step;
  }
}

/** Removes earlier report PDFs from the cache (best effort). They aren't deleted right after sharing,
 * because on Android the receiving app may still be reading the file when the share sheet closes. */
function clearOldReports() {
  try {
    for (const entry of Paths.cache.list()) {
      if (entry instanceof File && /^PreConnix_(RRA|Reproductive_Readiness_Score|Reproductive_Health_Score)_.*\.pdf$/.test(entry.name)) entry.delete();
    }
  } catch {
    // Cache clean-up is optional.
  }
}

export async function shareReport(result: AssessmentResult): Promise<void> {
  let step = 'sharing-check';
  try {
    if (!(await Sharing.isAvailableAsync())) throw new Error('sharing unavailable on this device');
    clearOldReports();

    step = 'print';
    const { settings } = cached();
    const html = buildReportHtml(result, {
      consultation: { url: settings.consultationUrl, countries: settings.consultationCountries }
    });
    // The printer's own output file can sit outside the app's storage (e.g. in Expo Go), where the
    // app may not read or share it. So take the PDF bytes and write our own copy into the app cache.
    const printed = await Print.printToFileAsync({ html, base64: true });
    if (!printed.base64) throw new Error('printer returned no data');

    step = 'save';
    const pdf = new File(Paths.cache, reportFileName(result));
    if (pdf.exists) pdf.delete();
    pdf.create();
    pdf.write(printed.base64, { encoding: 'base64' });
    try {
      new File(printed.uri).delete();
    } catch {
      // Not always permitted outside the app's storage; the system clears its print cache.
    }

    step = 'share';
    await Sharing.shareAsync(pdf.uri, {
      mimeType: 'application/pdf',
      UTI: 'com.adobe.pdf',
      dialogTitle: 'Share your Reproductive Health Score'
    });
  } catch (e) {
    throw new ReportError(step, e);
  }
}
