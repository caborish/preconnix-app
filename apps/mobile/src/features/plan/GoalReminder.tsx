// Check-in reminder for a repeating goal: every day, or once a week on a chosen day, at a chosen time.
// Scheduled on the phone like any reminder; the lock screen stays neutral ("You have a reminder").
import { Chip, ChipRow } from '@/design/components';
import { SectionLabel } from '@/features/plan/Field';
import { TIME_OPTIONS, WEEKDAYS, type Reminder } from '@/features/reminders/model';
import { deleteGoalReminders, ensurePermission, saveReminder } from '@/features/reminders/store';
import type { Rhythm } from '@/core/api';

export interface ReminderChoice {
  /** Index into TIME_OPTIONS, or null for no reminder. */
  time: number | null;
  /** 1 = Sunday … 7 = Saturday (weekly goals). */
  weekday: number;
}

export const defaultReminder = (): ReminderChoice => ({ time: 3, weekday: 1 });

export const choiceFrom = (r: Reminder | null): ReminderChoice =>
  r ? { time: Math.max(0, TIME_OPTIONS.findIndex(t => t.hour === r.hour && t.minute === r.minute)), weekday: r.weekday ?? 1 } : { time: null, weekday: 1 };

export function ReminderPicker({ rhythm, value, onChange }: { rhythm: Rhythm; value: ReminderChoice; onChange: (v: ReminderChoice) => void }) {
  if (rhythm === 'once' || rhythm === 'monthly') return null; // reminders repeat daily or weekly only
  return (
    <>
      <SectionLabel>{rhythm === 'daily' ? 'Remind me to check in every day at' : 'Remind me to check in every week'}</SectionLabel>
      {rhythm === 'weekly' && value.time !== null ? (
        <ChipRow label="Reminder day">
          {WEEKDAYS.map((d, i) => <Chip key={d} label={d} selected={value.weekday === i + 1} onPress={() => onChange({ ...value, weekday: i + 1 })} />)}
        </ChipRow>
      ) : null}
      <ChipRow label="Reminder time">
        <Chip label="No reminder" selected={value.time === null} onPress={() => onChange({ ...value, time: null })} />
        {TIME_OPTIONS.map((t, i) => <Chip key={t.label} label={t.label} selected={value.time === i} onPress={() => onChange({ ...value, time: i })} />)}
      </ChipRow>
    </>
  );
}

/**
 * Replaces the goal's reminder with the chosen one. Returns false if notifications are turned off on the phone
 * (the goal itself is still saved).
 */
export async function applyGoalReminder(goalId: string, title: string, rhythm: Rhythm, choice: ReminderChoice): Promise<boolean> {
  await deleteGoalReminders(goalId);
  if (rhythm === 'once' || rhythm === 'monthly' || choice.time === null) return true;
  if (!(await ensurePermission())) return false;
  const t = TIME_OPTIONS[choice.time];
  await saveReminder({
    id: `g-${goalId}`,
    label: `Check in: ${title}`.slice(0, 80),
    frequency: rhythm,
    hour: t.hour,
    minute: t.minute,
    weekday: rhythm === 'weekly' ? choice.weekday : undefined,
    showDetail: false,
    enabled: true,
    goalId
  });
  return true;
}
