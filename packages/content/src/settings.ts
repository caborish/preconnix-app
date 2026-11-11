// Defaults for settings staff can change in the admin console. The app falls back to these offline.
export interface ContentSettings {
  /** One-on-one consultation booking page (shown to people in Nigeria only). */
  consultationUrl: string;
  /** Countries where consultation booking is offered. */
  consultationCountries: string[];
  /** Quick-pick labels for reminders. Plain actions, no clinical advice. */
  reminderSuggestions: string[];
}

export const DEFAULT_SETTINGS: ContentSettings = {
  consultationUrl: 'https://preconnix.com/reproductive-life-plan/',
  consultationCountries: ['NG'],
  reminderSuggestions: ['Take my daily supplement', 'Book a check-up', 'Do a lesson in Learn', 'Review my plan', 'Drink more water']
};

export function settingsProblems(s: ContentSettings): string[] {
  const p: string[] = [];
  if (!/^https:\/\/[^\s]+$/.test(s.consultationUrl)) p.push('Consultation link must start with https://');
  if (!s.consultationCountries.every(c => /^[A-Z]{2}$/.test(c))) p.push('Countries must be 2-letter codes, e.g. NG');
  if (s.reminderSuggestions.length > 10) p.push('At most 10 reminder suggestions');
  if (s.reminderSuggestions.some(r => !r.trim() || r.length > 80)) p.push('Each reminder suggestion needs 1–80 characters');
  return p;
}
