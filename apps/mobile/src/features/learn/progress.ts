// Lesson progress is kept on this phone only (never sent to the server or analytics).
import * as SecureStore from 'expo-secure-store';

const KEY = 'pcx.learn.completed';

export async function completedLessons(): Promise<Set<string>> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return new Set(raw ? (JSON.parse(raw) as string[]) : []);
  } catch {
    return new Set();
  }
}

export async function markLessonComplete(id: string): Promise<void> {
  const done = await completedLessons();
  done.add(id);
  await SecureStore.setItemAsync(KEY, JSON.stringify([...done]));
}

/** Forgets lesson progress and saved lessons on this phone (after the account is deleted). */
export async function clearLearnData(): Promise<void> {
  await SecureStore.deleteItemAsync(KEY).catch(() => undefined);
  await SecureStore.deleteItemAsync('pcx.learn.saved').catch(() => undefined);
}
