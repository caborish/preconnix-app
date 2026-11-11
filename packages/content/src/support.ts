// Private support messages (written at Dr Gloria's direction and approved by her, Review 4, 9 Nov 2026).
// Clinical wording and safety numbers: changes need her approval. Never on a shared plan unless the member chooses.
export type SupportTopic = 'relationship_safety' | 'mental_health' | 'substance_use';
export interface SupportMessage { topic: SupportTopic; title: string; lines: string[]; numbers: { name: string; number: string }[] }

const EMERGENCY = { name: 'Emergency', number: '112' };

export const SUPPORT_MESSAGES: Record<SupportTopic, SupportMessage> = {
  relationship_safety: {
    topic: 'relationship_safety',
    title: 'If you feel unsafe',
    lines: [
      'You deserve to feel safe, and what is happening is not your fault.',
      'If you can, tell someone you trust or a health worker. Keep important numbers and documents somewhere you can reach them quickly.',
      'If you are in immediate danger, call 112.'
    ],
    numbers: [EMERGENCY, { name: 'Federal Violence Against Girls & Women line', number: '0800 7273 2255' }, { name: 'Lagos State DSVA (24 hours)', number: '08000 333 333' }]
  },
  mental_health: {
    topic: 'mental_health',
    title: 'Support for your mental health',
    lines: [
      'How you feel matters. Depression and anxiety are health conditions, and they can be treated.',
      'Talk to a health worker about how you have been feeling, and to someone you trust.',
      'If you take medicine for your mental health, do not stop it before speaking to your clinician. Stopping can bring symptoms back.',
      'If you are in immediate danger, or thinking of harming yourself, call 112.'
    ],
    numbers: [EMERGENCY, { name: 'Lagos Lifeline', number: '0700 000 6463' }, { name: 'She Writes Woman', number: '0800 800 2000' }]
  },
  substance_use: {
    topic: 'substance_use',
    title: 'Help with drugs or medicines',
    lines: [
      'Many people need support to cut down or stop, and there is no shame in that. Small changes count.',
      'A health worker can help you make a plan that fits your life.',
      'If you have been using alcohol, opioids or sedative medicines heavily, speak to a health worker before stopping suddenly.'
    ],
    numbers: [{ name: 'NDLEA counselling (free, 24 hours)', number: '0800 1020 3040' }]
  }
};

export const supportMessage = (topic: string): SupportMessage => SUPPORT_MESSAGES[topic as SupportTopic];
export const supportMessages = (topics: string[] | undefined): SupportMessage[] => (topics ?? []).filter(t => t in SUPPORT_MESSAGES).map(supportMessage);
