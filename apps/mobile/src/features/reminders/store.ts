// Saves reminders on the phone and keeps scheduled notifications in step with them.
import { File, Paths } from 'expo-file-system';
import * as Notifications from 'expo-notifications';
import { notificationContent, triggerFor, type Reminder } from './model';

const file = () => new File(Paths.document, 'reminders.json');

// Show reminders while the app is open too.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false })
});

export async function loadReminders(): Promise<Reminder[]> {
  try {
    const f = file();
    return f.exists ? (JSON.parse(await f.text()) as Reminder[]) : [];
  } catch {
    return [];
  }
}

function persist(list: Reminder[]) {
  const f = file();
  if (!f.exists) f.create();
  f.write(JSON.stringify(list));
}

/** Asks for notification permission the first time a reminder is saved (not at app start). */
export async function ensurePermission(): Promise<boolean> {
  const current = await Notifications.getPermissionsAsync();
  if (current.granted) return true;
  if (!current.canAskAgain) return false;
  return (await Notifications.requestPermissionsAsync()).granted;
}

async function schedule(r: Reminder): Promise<string> {
  return Notifications.scheduleNotificationAsync({
    content: notificationContent(r),
    trigger: triggerFor(r) as Notifications.NotificationTriggerInput
  });
}

async function unschedule(r: Reminder) {
  if (r.notificationId) await Notifications.cancelScheduledNotificationAsync(r.notificationId).catch(() => undefined);
}

export async function saveReminder(r: Reminder): Promise<Reminder[]> {
  const list = await loadReminders();
  const existing = list.find(x => x.id === r.id);
  if (existing) await unschedule(existing);
  const next: Reminder = { ...r, notificationId: r.enabled ? await schedule(r) : undefined };
  const updated = existing ? list.map(x => (x.id === r.id ? next : x)) : [...list, next];
  persist(updated);
  return updated;
}

/** The check-in reminder for a goal, if it has one. */
export async function reminderForGoal(goalId: string): Promise<Reminder | null> {
  return (await loadReminders()).find(r => r.goalId === goalId) ?? null;
}

/** Removes a goal's reminders (when the goal is deleted, finished or no longer repeats). */
export async function deleteGoalReminders(goalId: string): Promise<void> {
  for (const r of (await loadReminders()).filter(x => x.goalId === goalId)) await deleteReminder(r.id);
}

/** Removes every goal's reminder (on sign-out). The person's own other reminders stay. */
export async function deleteAllGoalReminders(): Promise<void> {
  for (const r of (await loadReminders()).filter(x => x.goalId)) await deleteReminder(r.id);
}

/** Opens the goal when its reminder is tapped. Returns a function that stops listening. */
export function onGoalReminderTapped(open: (goalId: string) => void): () => void {
  const sub = Notifications.addNotificationResponseReceivedListener(res => {
    const goalId = res.notification.request.content.data?.goalId;
    if (typeof goalId === 'string') open(goalId);
  });
  return () => sub.remove();
}

export async function deleteReminder(id: string): Promise<Reminder[]> {
  const list = await loadReminders();
  const r = list.find(x => x.id === id);
  if (r) await unschedule(r);
  const updated = list.filter(x => x.id !== id);
  persist(updated);
  return updated;
}

/** Removes every reminder on this phone (after the account is deleted). */
export async function deleteAllReminders(): Promise<void> {
  for (const r of await loadReminders()) await deleteReminder(r.id);
}
