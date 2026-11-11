// Saved (bookmarked) lessons, kept on this phone only, like lesson progress.
import * as SecureStore from 'expo-secure-store';

const KEY = 'pcx.learn.saved';

export async function savedLessons(): Promise<string[]> {
  try {
    const raw = await SecureStore.getItemAsync(KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
}

/** Saves or unsaves a lesson; returns whether it is now saved. Newest saves come first. */
export async function toggleSavedLesson(id: string): Promise<boolean> {
  const list = await savedLessons();
  const saved = !list.includes(id);
  await SecureStore.setItemAsync(KEY, JSON.stringify(saved ? [id, ...list] : list.filter(x => x !== id)));
  return saved;
}
