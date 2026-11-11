// "My Reproductive Life Plan" as a PDF on the phone, shared with the system share sheet (like the report, ADR-015).
// Nothing is uploaded: the PDF exists only in the app's cache until the next one replaces it.
import { File, Paths } from 'expo-file-system';
import * as Print from 'expo-print';
import * as Sharing from 'expo-sharing';
import {
  areaExplainer, buildPlanHtml, essentialsFor, FAMILY_PICTURES, LEVEL_LABEL, planFileName, planPath, SUPPORT_OPTIONS, VACCINES,
  type PlanDocument
} from '@preconnix/content';
import type { Dashboard, GoalCategory, Plan } from '@/core/api';
import { ICONS, type IconName } from '@/design/icons';
import { formatDue, HORIZON_LABEL, intentionLabel, RHYTHM_LABEL } from './labels';

/** Icons for the visual plan (Dr Gloria, 5 Nov 2026: pictures, not paragraphs). */
export const CATEGORY_ICON: Record<GoalCategory, IconName> = {
  checkups_screening: 'stethoscope', nutrition_supplements: 'apple', lifestyle: 'pulse', mental_wellbeing: 'smile',
  relationships_support: 'people', contraception_planning: 'shield', finances_housing: 'home', learning: 'learn'
} as Record<GoalCategory, IconName>;
const AREA_ICON: Record<string, IconName> = {
  demographics_timing: 'calendar', obstetric_history: 'heart', physical_medical: 'stethoscope', sexual_substance: 'ban',
  mental_social_env: 'smile', family_planning: 'shield', physical_nutrition: 'apple', infectious_immunization: 'shield',
  chronic_medications: 'pill', substance_use: 'ban', reproductive_genetic: 'sprout', mental_health_safety: 'smile'
};
const ESSENTIAL_ICON: Record<string, IconName> = {
  checkup: 'stethoscope', health_check: 'stethoscope', genotype: 'sprout', blood_pressure: 'pulse', medicines: 'pill',
  folic_acid: 'pill', iron: 'apple', fruit_veg: 'apple', alcohol: 'ban', alcohol_less: 'ban', smoking: 'ban', activity: 'pulse',
  vaccines: 'shield', infection_tests: 'clipboard', malaria: 'home', contraception: 'shield', sti_prevention: 'shield',
  mood: 'smile', costs: 'home', partner_talk: 'people'
};
const svg = (name: IconName | undefined) => ICONS[name ?? 'check'];

/** What goes in the PDF: her name (if she chose one), her choices, her result and the approved essentials. */
export function planDocument(plan: Plan, dash: Dashboard, guideOn: boolean, now = new Date()): PlanDocument {
  const r = dash.latestResult;
  const focus = r?.focus ?? [];
  const guide = { intention: plan.intention, pathway: r?.pathway ?? null, focus, only: plan.essentialsFocus };
  const items = guideOn ? essentialsFor(guide) : [];
  const pregnancy = planPath(guide).pregnancy;
  return {
    date: now.toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' }),
    name: dash.firstName ?? null,
    path: pregnancy ? 'pregnancy' : 'health',
    pathIcon: svg(pregnancy ? 'heart' : 'shield'),
    plan: [
      intentionLabel(plan.intention),
      plan.horizon ? HORIZON_LABEL[plan.horizon] : null,
      plan.familyPicture ? FAMILY_PICTURES[plan.familyPicture] : null
    ].filter((x): x is string => !!x),
    result: r ? {
      score: r.score, band: r.band, bandLabel: r.bandLabel,
      areas: focus.slice(0, 3).map(f => ({ name: f.name, percent: f.percent, level: LEVEL_LABEL[areaExplainer(f).level], icon: svg(AREA_ICON[f.code] ?? 'pulse') }))
    } : undefined,
    goals: plan.goals.filter(g => g.status !== 'archived').map(g => ({
      title: g.title, how: RHYTHM_LABEL[g.rhythm], by: formatDue(g.targetDate), done: g.status === 'done', icon: svg(CATEGORY_ICON[g.category] ?? 'plan')
    })),
    essentials: items.filter(i => i.id !== 'vaccines' || !guideOn).map(i => ({ title: i.title, done: plan.essentialsDone.includes(i.id), icon: svg(ESSENTIAL_ICON[i.id] ?? 'check') })),
    vaccines: guideOn && (!plan.essentialsFocus || plan.essentialsFocus.includes('vaccines')) ? VACCINES.map(v => ({ name: v.name, done: plan.essentialsDone.includes(v.id) })) : [],
    support: plan.support.map(s => SUPPORT_OPTIONS[s]),
    supportIcon: svg('people'),
    questions: plan.providerQuestions,
    reviewDate: formatDue(plan.reviewDate)
  };
}

export async function sharePlan(doc: PlanDocument): Promise<void> {
  if (!(await Sharing.isAvailableAsync())) throw new Error('Sharing is not available on this device.');
  try {
    for (const entry of Paths.cache.list()) if (entry instanceof File && /^PreConnix_My_Reproductive_Life_Plan_.*\.pdf$/.test(entry.name)) entry.delete();
  } catch {
    // Cache clean-up is optional.
  }
  // Keep our own copy in the app cache (the printer's file may sit where the app cannot share it, e.g. Expo Go).
  const printed = await Print.printToFileAsync({ html: buildPlanHtml(doc), base64: true });
  if (!printed.base64) throw new Error('The PDF could not be made.');
  const pdf = new File(Paths.cache, planFileName(new Date().toISOString().slice(0, 10)));
  if (pdf.exists) pdf.delete();
  pdf.create();
  pdf.write(printed.base64, { encoding: 'base64' });
  try { new File(printed.uri).delete(); } catch { /* the system clears its print cache */ }
  await Sharing.shareAsync(pdf.uri, { mimeType: 'application/pdf', UTI: 'com.adobe.pdf', dialogTitle: 'Share my Reproductive Life Plan' });
}
