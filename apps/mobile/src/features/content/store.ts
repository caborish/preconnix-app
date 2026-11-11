// Lessons and settings from the server (edited in the admin console), with a copy kept on the phone for
// offline use. Before the first download, the built-in copy is used. Test builds also preview drafts.
import Constants from 'expo-constants';
import { File, Paths } from 'expo-file-system';
import { useEffect, useState } from 'react';
import { DEFAULT_SETTINGS, LESSONS, lessonsForBuild, type ContentSettings, type Lesson } from '@preconnix/content';
import { getContent, usesRemoteServer } from '@/core/api';

export interface AppContent { lessons: Lesson[]; settings: ContentSettings }

const testBuild = Constants.expoConfig?.extra?.testBuild === true;
const BUILT_IN: AppContent = { lessons: lessonsForBuild(testBuild, LESSONS), settings: DEFAULT_SETTINGS };
const file = () => new File(Paths.document, 'content.json');

let current: AppContent | null = null;
const listeners = new Set<(c: AppContent) => void>();

/** The latest content without waiting for the network (downloaded copy, else built-in). */
export function cached(): AppContent {
  if (current) return current;
  try {
    const f = file();
    if (f.exists) current = { ...BUILT_IN, ...(JSON.parse(f.textSync()) as AppContent) };
  } catch {
    // A damaged copy is ignored; the built-in copy is used until the next download.
  }
  return current ?? BUILT_IN;
}

export async function refreshContent(): Promise<AppContent> {
  // The Azure server never serves drafts, so test builds keep showing the built-in drafts for lessons it has not
  // published yet; approved lessons come from the server.
  const fresh = await getContent(testBuild && !usesRemoteServer);
  const lessons = testBuild && usesRemoteServer
    ? BUILT_IN.lessons.map(l => fresh.lessons.find(f => f.id === l.id) ?? l)
    : fresh.lessons;
  current = { lessons, settings: { ...DEFAULT_SETTINGS, ...fresh.settings } };
  try {
    const f = file();
    if (!f.exists) f.create();
    f.write(JSON.stringify(current));
  } catch {
    // Saving the offline copy is best effort.
  }
  listeners.forEach(l => l(current!));
  return current;
}

/** Current content; downloads a fresh copy each time a screen using it mounts. */
export function useContent(): AppContent {
  const [content, setContent] = useState(cached);
  useEffect(() => {
    listeners.add(setContent);
    refreshContent().catch(() => undefined);
    return () => { listeners.delete(setContent); };
  }, []);
  return content;
}

export const canBookConsultation = (settings: ContentSettings, country: string | null | undefined) =>
  !!country && settings.consultationCountries.includes(country);
