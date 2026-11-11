// Reminders (PRD F11): scheduled on the phone only (ADR-007), never sent to the server.
// Lock-screen text is neutral unless the person chooses to show the details for that reminder.
// Plain TypeScript (no Expo imports), unit-tested with node:test.

export type Frequency = 'daily' | 'weekly' | 'once';

export interface Reminder {
  id: string;
  label: string;
  frequency: Frequency;
  hour: number;
  minute: number;
  /** 1 = Sunday … 7 = Saturday (Expo's weekly trigger convention). Weekly only. */
  weekday?: number;
  /** YYYY-MM-DD. Once only. */
  date?: string;
  /** Show the label on the lock screen. Off by default. */
  showDetail: boolean;
  enabled: boolean;
  /** Identifier of the scheduled notification, while enabled. */
  notificationId?: string;
  /** Set for a goal's check-in reminder; tapping the notification opens that goal. */
  goalId?: string;
}


export const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
export const TIME_OPTIONS = [
  { label: '7:00', hour: 7, minute: 0 },
  { label: '9:00', hour: 9, minute: 0 },
  { label: '12:00', hour: 12, minute: 0 },
  { label: '18:00', hour: 18, minute: 0 },
  { label: '21:00', hour: 21, minute: 0 }
];

export const NEUTRAL_BODY = 'You have a reminder';

/** What the notification shows. The title never contains the reminder's details. */
export function notificationContent(r: Reminder): { title: string; body: string; data?: { goalId: string } } {
  return { title: 'PreConnix', body: r.showDetail ? r.label : NEUTRAL_BODY, ...(r.goalId ? { data: { goalId: r.goalId } } : {}) };
}

/** Trigger in Expo's SchedulableTriggerInput shape ('daily' | 'weekly' | 'date'). */
export function triggerFor(r: Reminder):
  | { type: 'daily'; hour: number; minute: number }
  | { type: 'weekly'; weekday: number; hour: number; minute: number }
  | { type: 'date'; date: Date } {
  if (r.frequency === 'daily') return { type: 'daily', hour: r.hour, minute: r.minute };
  if (r.frequency === 'weekly') return { type: 'weekly', weekday: r.weekday ?? 2, hour: r.hour, minute: r.minute };
  const [y, m, d] = (r.date ?? '').split('-').map(Number);
  return { type: 'date', date: new Date(y, m - 1, d, r.hour, r.minute, 0, 0) };
}

export function reminderProblems(r: Reminder, now = new Date()): string[] {
  const p: string[] = [];
  if (!r.label.trim()) p.push('Add a label');
  if (r.label.length > 80) p.push('Label is too long');
  if (!(r.hour >= 0 && r.hour <= 23 && r.minute >= 0 && r.minute <= 59)) p.push('Pick a time');
  if (r.frequency === 'weekly' && !(r.weekday && r.weekday >= 1 && r.weekday <= 7)) p.push('Pick a day');
  if (r.frequency === 'once') {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(r.date ?? '')) p.push('Pick a date');
    else if ((triggerFor(r) as { date: Date }).date <= now) p.push('Pick a time in the future');
  }
  return p;
}

const pad = (n: number) => String(n).padStart(2, '0');

export function describe(r: Reminder): string {
  const time = `${pad(r.hour)}:${pad(r.minute)}`;
  if (r.frequency === 'daily') return `Every day at ${time}`;
  if (r.frequency === 'weekly') return `Every ${WEEKDAYS[(r.weekday ?? 2) - 1]} at ${time}`;
  const d = new Date(`${r.date}T12:00:00`);
  return `${d.toLocaleDateString(undefined, { day: 'numeric', month: 'short' })} at ${time}`;
}

/** Date in N days as YYYY-MM-DD (local time). */
export function inDays(n: number, from = new Date()): string {
  const d = new Date(from.getFullYear(), from.getMonth(), from.getDate() + n);
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}
