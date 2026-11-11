// Learn (design handoff; course cards 4 Nov 2026): For you / Topics / Saved. For you leads with the next lesson, then lessons for the
// person's result focus areas, then every lesson. Topics groups lessons (packages/content topics.ts). Saved lists
// lessons bookmarked on this phone. The chosen tab stays put when returning to Learn.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { LESSON_ICON, lessonsForFocus, topicOf, TOPICS, type Lesson, type Topic } from '@preconnix/content';
import { getDashboard, usesRemoteServer } from '@/core/api';
import { isSignedIn } from '@/core/auth';
import { Body, Button, Screen } from '@/design/components';
import { Icon } from '@/design/Icon';
import { TabHeader } from '@/design/TabHeader';
import { colors, fonts, radius, space } from '@/design/tokens';
import { useContent } from '@/features/content/store';
import { completedLessons } from '@/features/learn/progress';
import { savedLessons } from '@/features/learn/saved';

type Tab = 'for-you' | 'topics' | 'saved';
const TABS: { id: Tab; label: string }[] = [{ id: 'for-you', label: 'For you' }, { id: 'topics', label: 'Topics' }, { id: 'saved', label: 'Saved' }];

const open = (l: Lesson) => router.push(`/learn/${l.id}` as never);

// Course cards (owner, 4 Nov 2026: less text, a picture per topic instead of a book on every lesson): a coloured
// band with the lesson's own icon and its topic, then the title, a one-line brief and the time it takes.
const TONES = [
  { wash: colors.greenWash, ink: colors.green },
  { wash: colors.roseWash, ink: colors.roseDark },
  { wash: colors.violetWash, ink: colors.violetDark },
  { wash: '#FFF5E0', ink: '#8A5A00' }
];
const toneOf = (lessonId: string) => TONES[Math.max(0, TOPICS.findIndex(t => t.lessonIds.includes(lessonId))) % TONES.length];

function LessonRow({ lesson, done, saved, note }: { lesson: Lesson; done: boolean; saved?: boolean; note?: string }) {
  const tone = toneOf(lesson.id);
  const topic = topicOf(lesson.id);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${lesson.title}. ${lesson.summary} ${lesson.minutes} minutes.${done ? ' Complete.' : ''}${saved ? ' Saved.' : ''}`}
      onPress={() => open(lesson)}
      style={({ pressed }) => [styles.course, pressed && { opacity: 0.9 }]}
    >
      <View style={[styles.courseArt, { backgroundColor: tone.wash }]}>
        <View style={styles.courseIcon}><Icon name={LESSON_ICON[lesson.id] ?? 'learn'} size={30} color={tone.ink} /></View>
        <Text style={[styles.courseTopic, { color: tone.ink }]}>{note ?? topic?.title ?? 'Lesson'}</Text>
        {done ? <View style={styles.doneBadge}><Icon name="check" size={16} color={colors.white} /></View> : null}
      </View>
      <View style={styles.courseBody}>
        <Text style={styles.courseTitle}>{lesson.title}</Text>
        <Text style={styles.courseBrief} numberOfLines={2}>{lesson.summary}</Text>
        <View style={styles.courseFoot}>
          <Icon name="clock" size={15} color={colors.textMuted} />
          <Text style={styles.meta}>{lesson.minutes} min{done ? ' · Done' : ''}{lesson.status === 'draft' ? ' · draft' : ''}</Text>
          {saved ? <View style={{ marginLeft: 'auto' }}><Icon name="bookmark" size={16} color={colors.violetDark} /></View> : null}
        </View>
      </View>
    </Pressable>
  );
}

export default function Learn() {
  const { lessons } = useContent();
  const [tab, setTab] = useState<Tab>('for-you');
  const [topic, setTopic] = useState<Topic | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());
  const [saved, setSaved] = useState<string[]>([]);
  const [focus, setFocus] = useState<{ code: string; name: string }[]>([]);

  useFocusEffect(useCallback(() => {
    completedLessons().then(setDone);
    savedLessons().then(setSaved);
    // On the Azure server, only ask for the result once signed in: browsing Learn never opens the sign-in page.
    (async () => {
      if (usesRemoteServer && !(await isSignedIn())) return;
      const d = await getDashboard();
      setFocus(d.latestResult?.focus ?? []);
    })().catch(() => undefined);
  }, []));

  const byId = new Map(lessons.map(l => [l.id, l]));
  const next = lessons.find(l => !done.has(l.id));
  const count = lessons.filter(l => done.has(l.id)).length;
  const focusName = new Map<string, string>();
  for (const f of focus) for (const id of lessonsForFocus([f.code])) if (!focusName.has(id)) focusName.set(id, f.name);
  const forFocus = lessonsForFocus(focus.map(f => f.code))
    .map(id => byId.get(id))
    .filter((l): l is Lesson => !!l && !done.has(l.id) && l.id !== next?.id)
    .slice(0, 3);
  const savedSet = new Set(saved);
  const savedList = saved.map(id => byId.get(id)).filter((l): l is Lesson => !!l);
  const grouped = new Set(TOPICS.flatMap(t => t.lessonIds));
  const ungrouped = lessons.filter(l => !grouped.has(l.id));

  return (
    <Screen top>
      <TabHeader title="A little learning, every day" />
      <View style={styles.tabs} accessibilityRole="tablist">
        {TABS.map(t => (
          <Pressable
            key={t.id}
            accessibilityRole="tab"
            accessibilityState={{ selected: tab === t.id }}
            onPress={() => { setTab(t.id); setTopic(null); }}
            style={[styles.tab, tab === t.id && styles.tabOn]}
          >
            <Text style={[styles.tabText, tab === t.id && styles.tabTextOn]}>{t.label}</Text>
          </Pressable>
        ))}
      </View>

      {lessons.length === 0 ? <Body muted>Lessons are coming soon.</Body> : null}

      {tab === 'for-you' && lessons.length ? (
        <>
          {next ? (
            <Pressable accessibilityRole="button" accessibilityLabel={`${count ? 'Next' : 'Start with'}: ${next.title}, ${next.minutes} minutes`} onPress={() => open(next)} style={styles.feature}>
              <View style={[styles.featureArt, { backgroundColor: toneOf(next.id).wash }]}><Icon name={LESSON_ICON[next.id] ?? 'learn'} size={40} color={toneOf(next.id).ink} /></View>
              <Text style={styles.eyebrow}>{topicOf(next.id)?.title ?? 'Lesson'} · {next.minutes} min</Text>
              <Text style={styles.featureTitle}>{next.title}</Text>
              <Text style={styles.featureBody}>{next.summary}</Text>
              <View style={styles.featureFoot}>
                <Text style={styles.link}>{count ? 'Continue learning' : 'Start lesson'}</Text>
                <Icon name="play" size={20} color={colors.violetDark} />
              </View>
            </Pressable>
          ) : (
            <View style={styles.feature}>
              <Text style={styles.featureTitle}>You have finished every lesson</Text>
              <Text style={styles.featureBody}>Open any lesson again whenever you like.</Text>
            </View>
          )}

          <View style={styles.progress} accessible accessibilityLabel={`${count} of ${lessons.length} lessons complete`}>
            <View style={styles.track}><View style={[styles.fill, { width: `${Math.max(2, (count / lessons.length) * 100)}%` }]} /></View>
            <Text style={styles.meta}>{count} of {lessons.length} lessons complete</Text>
          </View>

          {forFocus.length ? (
            <>
              <Text style={styles.h} accessibilityRole="header">For your focus areas</Text>
              {forFocus.map(l => <LessonRow key={l.id} lesson={l} done={false} saved={savedSet.has(l.id)} note={focusName.get(l.id)} />)}
            </>
          ) : null}

          <Text style={styles.h} accessibilityRole="header">All lessons</Text>
          {lessons.map(l => <LessonRow key={l.id} lesson={l} done={done.has(l.id)} saved={savedSet.has(l.id)} />)}
        </>
      ) : null}

      {tab === 'topics' && !topic ? (
        <>
          <Text style={styles.h} accessibilityRole="header">Explore a topic</Text>
          <View style={styles.grid}>
            {TOPICS.map((t, i) => {
              const n = t.lessonIds.filter(id => byId.has(id)).length;
              if (!n) return null;
              return (
                <Pressable key={t.id} accessibilityRole="button" accessibilityLabel={`${t.title}, ${n} lessons`} onPress={() => setTopic(t)}
                  style={({ pressed }) => [styles.topic, i % 2 ? styles.topicViolet : styles.topicRose, pressed && { opacity: 0.85 }]}>
                  <Icon name={t.icon} size={24} color={i % 2 ? colors.violetDark : colors.roseDark} />
                  <Text style={styles.topicTitle}>{t.title}</Text>
                  <Text style={styles.meta}>{n} {n === 1 ? 'lesson' : 'lessons'}</Text>
                </Pressable>
              );
            })}
          </View>
          {ungrouped.length ? (
            <>
              <Text style={styles.h} accessibilityRole="header">More lessons</Text>
              {ungrouped.map(l => <LessonRow key={l.id} lesson={l} done={done.has(l.id)} saved={savedSet.has(l.id)} />)}
            </>
          ) : null}
        </>
      ) : null}

      {tab === 'topics' && topic ? (
        <>
          <Pressable accessibilityRole="button" onPress={() => setTopic(null)} style={styles.back} hitSlop={8}>
            <Text style={styles.link}>‹ All topics</Text>
          </Pressable>
          <Text style={styles.topicHeading} accessibilityRole="header">{topic.title}</Text>
          <Text style={[styles.meta, { marginBottom: space.md }]}>{topic.summary}</Text>
          {topic.lessonIds.map(id => byId.get(id)).filter((l): l is Lesson => !!l).map(l => (
            <LessonRow key={l.id} lesson={l} done={done.has(l.id)} saved={savedSet.has(l.id)} />
          ))}
        </>
      ) : null}

      {tab === 'saved' ? (
        savedList.length ? (
          savedList.map(l => <LessonRow key={l.id} lesson={l} done={done.has(l.id)} saved />)
        ) : (
          <View style={styles.empty}>
            <Icon name="bookmark" size={28} color={colors.violetDark} />
            <Text style={styles.featureTitle}>Keep useful lessons close</Text>
            <Text style={[styles.featureBody, { textAlign: 'center' }]}>Tap Save in any lesson to find it here.</Text>
            <Button label="Explore lessons" variant="secondary" onPress={() => setTab('for-you')} />
          </View>
        )
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  tab: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.violetDark, borderColor: colors.violetDark },
  tabText: { fontFamily: fonts.label, fontSize: 14, color: colors.textPrimary },
  tabTextOn: { color: colors.white },
  feature: { backgroundColor: colors.violetWash, borderRadius: radius.md, padding: space.lg, gap: 6 },
  featureArt: { height: 96, borderRadius: 14, alignItems: 'center', justifyContent: 'center', marginBottom: space.sm },
  eyebrow: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.violetDark },
  featureTitle: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary },
  featureBody: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  featureFoot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginTop: space.xs },
  link: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.violetDark },
  progress: { marginTop: space.md, gap: 6 },
  track: { height: 6, borderRadius: 3, backgroundColor: colors.violetWash, overflow: 'hidden' },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.violet },
  h: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary, marginTop: space.xl, marginBottom: space.sm },
  course: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginBottom: space.md, overflow: 'hidden' },
  courseArt: { height: 84, flexDirection: 'row', alignItems: 'center', gap: space.md, paddingHorizontal: space.lg },
  courseIcon: { width: 52, height: 52, borderRadius: 16, backgroundColor: 'rgba(255,255,255,0.75)', alignItems: 'center', justifyContent: 'center' },
  courseTopic: { flex: 1, fontFamily: fonts.label, fontSize: 12, letterSpacing: 0.8, textTransform: 'uppercase' },
  doneBadge: { width: 28, height: 28, borderRadius: 14, backgroundColor: colors.good, alignItems: 'center', justifyContent: 'center' },
  courseBody: { padding: space.md, gap: 4 },
  courseTitle: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22, color: colors.textPrimary },
  courseBrief: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary },
  courseFoot: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  topic: { flexBasis: '47%', flexGrow: 1, minHeight: 112, borderRadius: radius.md, padding: space.lg, gap: 6, justifyContent: 'flex-end' },
  topicRose: { backgroundColor: colors.roseWash },
  topicViolet: { backgroundColor: colors.violetWash },
  topicTitle: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary, marginTop: space.sm },
  back: { alignSelf: 'flex-start', paddingVertical: space.sm },
  topicHeading: { fontFamily: fonts.heading, fontSize: 22, color: colors.textPrimary, marginTop: space.xs },
  empty: { alignItems: 'center', gap: space.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.xl }
});
