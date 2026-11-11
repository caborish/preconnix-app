// Story lesson player: story cards → "what should they do next?" → every option explained → takeaway and
// where to learn more. Everyone sees the Nigerian story and Nigerian/WHO links (Nigeria-only market, 5 Nov 2026).
//
import * as WebBrowser from 'expo-web-browser';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { localise, resourceRegion, storyRegion } from '@preconnix/content';
import { getDashboard, usesRemoteServer } from '@/core/api';
import { isSignedIn } from '@/core/auth';
import { Icon } from '@/design/Icon';
import { Body, Button, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { canBookConsultation, useContent } from '@/features/content/store';
import { markLessonComplete } from '@/features/learn/progress';
import { savedLessons, toggleSavedLesson } from '@/features/learn/saved';

export default function LessonPlayer() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { lessons, settings } = useContent();
  const index = lessons.findIndex(l => l.id === id);
  const lesson = lessons[index];
  const [country, setCountry] = useState<string | null>(null);
  const [step, setStep] = useState(0);
  const [picked, setPicked] = useState<number | null>(null);
  const [finished, setFinished] = useState(false);
  const [saved, setSaved] = useState(false);

  // "Next lesson" reuses this screen: start the new lesson from the beginning.
  useEffect(() => { setStep(0); setPicked(null); setFinished(false); }, [id]);

  useEffect(() => { savedLessons().then(list => setSaved(list.includes(id))); }, [id]);

  // The country picks the story and links. On the Azure server it is only fetched once signed in, so opening a
  // lesson never opens the sign-in page.
  useEffect(() => {
    (async () => {
      if (usesRemoteServer && !(await isSignedIn())) return;
      setCountry((await getDashboard()).latestResult?.country ?? null);
    })().catch(() => undefined);
  }, []);

  const saveButton = (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected: saved }}
      accessibilityLabel={saved ? 'Saved. Tap to remove from Saved' : 'Save this lesson'}
      hitSlop={10}
      onPress={() => toggleSavedLesson(id).then(setSaved).catch(() => undefined)}
      style={[styles.save, saved && { backgroundColor: colors.violetDark, borderColor: colors.violetDark }]}
    >
      <Icon name="bookmark" size={20} color={saved ? colors.white : colors.violetDark} />
      <Text style={[styles.saveText, saved && { color: colors.white }]}>{saved ? 'Saved' : 'Save'}</Text>
    </Pressable>
  );

  if (!lesson) {
    return (
      <Screen footer={<Button label="Back to Learn" onPress={() => router.back()} />}>
        <Title>Lesson not found</Title>
      </Screen>
    );
  }

  const region = storyRegion(country);
  const story = lesson.story[region];
  const CHOICE = story.length;
  const EXPLAIN = CHOICE + 1;
  const TAKEAWAY = CHOICE + 2;
  const total = TAKEAWAY + 1;
  const next = lessons[index + 1];
  const t = (x: Parameters<typeof localise>[0]) => localise(x, region);

  if (finished) {
    return (
      <Screen
        footer={
          <>
            {next ? <Button label={`Next lesson: ${next.title}`} onPress={() => router.replace(`/learn/${next.id}` as never)} /> : null}
            <Button label="Back to Learn" variant="secondary" onPress={() => router.back()} />
          </>
        }
      >
        <Stack.Screen options={{ title: 'Lesson complete' }} />
        <View style={styles.doneWrap}>
          <Text style={styles.doneTick}>✓</Text>
          <Title>Lesson complete</Title>
          <Body>You finished "{lesson.title}".</Body>
        </View>
      </Screen>
    );
  }

  const forward = async () => {
    if (step < TAKEAWAY) return setStep(s => s + 1);
    await markLessonComplete(lesson.id).catch(() => undefined);
    setFinished(true);
  };
  const nextLabel = step === CHOICE ? 'See what happens' : step === TAKEAWAY ? 'Finish' : 'Next';

  return (
    <Screen
      footer={
        <View style={styles.nav}>
          <View style={{ flex: 1 }}>
            <Button label="Back" variant="secondary" disabled={step === 0} onPress={() => setStep(s => s - 1)} />
          </View>
          <View style={{ flex: 1 }}>
            <Button label={nextLabel} disabled={step === CHOICE && picked === null} onPress={forward} />
          </View>
        </View>
      }
    >
      <Stack.Screen options={{ title: '', headerRight: () => saveButton }} />
      <Eyebrow>{`${lesson.minutes} min`}</Eyebrow>
      <Title>{lesson.title}</Title>
      <View style={styles.dots} accessibilityElementsHidden importantForAccessibility="no-hide-descendants">
        {Array.from({ length: total }, (_, i) => <View key={i} style={[styles.dot, i <= step && styles.dotOn]} />)}
      </View>

      {step < CHOICE ? (
        <View style={styles.card} accessible accessibilityLabel={`Story, part ${step + 1} of ${story.length}. ${story[step]}`}>
          <Text style={styles.cardLabel}>Story · {step + 1} of {story.length}</Text>
          <Text style={styles.story}>{story[step]}</Text>
        </View>
      ) : null}

      {step === CHOICE ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.question} accessibilityRole="header">{t(lesson.question)}</Text>
          <View accessibilityRole="radiogroup" style={{ gap: space.sm }}>
            {lesson.options.map((o, i) => {
              const on = picked === i;
              return (
                <Pressable
                  key={i}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: on }}
                  onPress={() => setPicked(i)}
                  style={[styles.option, on && styles.optionOn]}
                >
                  <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
                  <Text style={styles.optionText}>{t(o.label)}</Text>
                </Pressable>
              );
            })}
          </View>
        </View>
      ) : null}

      {step === EXPLAIN ? (
        <View style={{ gap: space.sm }}>
          <Text style={styles.question} accessibilityRole="header">Every choice, explained</Text>
          {lesson.options.map((o, i) => (
            <View key={i} style={[styles.explain, o.best && styles.explainBest, picked === i && styles.explainPicked]}>
              <View style={styles.tags}>
                {picked === i ? <Text style={styles.tagPicked}>Your choice</Text> : null}
                {o.best ? <Text style={styles.tagBest}>Strongest choice</Text> : null}
              </View>
              <Text style={styles.optionTitle}>{t(o.label)}</Text>
              <Text style={styles.body}>{t(o.explanation)}</Text>
            </View>
          ))}
        </View>
      ) : null}

      {step === TAKEAWAY ? (
        <View style={{ gap: space.md }}>
          <View style={styles.takeaway}>
            <Text style={styles.takeawayLabel}>Takeaway</Text>
            <Text style={styles.takeawayText}>{lesson.takeaway}</Text>
          </View>
          <Text style={styles.h}>Learn more</Text>
          {lesson.resources[resourceRegion(country)].map(r => (
            <Pressable key={r.url} accessibilityRole="link" onPress={() => WebBrowser.openBrowserAsync(r.url)} style={styles.link}>
              <Text style={styles.linkText}>{r.label}</Text>
              <Text style={styles.linkArrow}>↗</Text>
            </Pressable>
          ))}
          {lesson.offerConsultation && canBookConsultation(settings, country) ? (
            <Button label="Book a one-on-one consultation" variant="secondary" onPress={() => WebBrowser.openBrowserAsync(settings.consultationUrl)} />
          ) : null}
          {lesson.status === 'approved' && lesson.reviewedBy ? (
            <Text style={styles.reviewed}>Reviewed by {lesson.reviewedBy}, {lesson.reviewedOn}</Text>
          ) : null}
        </View>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  save: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 36, paddingHorizontal: 12, borderRadius: 18, borderWidth: 1.5, borderColor: colors.violet },
  saveText: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark },
  nav: { flexDirection: 'row', gap: space.sm },
  dots: { flexDirection: 'row', gap: 4, marginVertical: space.md },
  dot: { flex: 1, height: 5, borderRadius: 3, backgroundColor: colors.violetWash },
  dotOn: { backgroundColor: colors.rose },
  card: { backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.xl, minHeight: 220, justifyContent: 'center', gap: space.md },
  cardLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.roseDark },
  story: { fontFamily: fonts.body, fontSize: 19, lineHeight: 29, color: colors.textPrimary },
  question: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 28, color: colors.textPrimary, marginBottom: space.xs },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.white, padding: space.md },
  optionOn: { borderColor: colors.violet, backgroundColor: colors.violetWash },
  radio: { width: 22, height: 22, borderRadius: 11, borderWidth: 2, borderColor: '#B7ABC4', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.violet },
  radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: colors.violet },
  optionText: { flex: 1, fontFamily: fonts.body, fontSize: 16, lineHeight: 22, color: colors.textPrimary },
  explain: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: space.md, gap: space.xs },
  explainBest: { borderColor: colors.good, borderWidth: 2 },
  explainPicked: { backgroundColor: colors.violetWash },
  tags: { flexDirection: 'row', gap: space.sm },
  tagPicked: { fontFamily: fonts.label, fontSize: 12, color: colors.violetDark },
  tagBest: { fontFamily: fonts.label, fontSize: 12, color: '#1C7A59' },
  optionTitle: { fontFamily: fonts.label, fontSize: 15, lineHeight: 21, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  takeaway: { backgroundColor: colors.plum, borderRadius: radius.md, padding: space.lg, gap: space.xs },
  takeawayLabel: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: '#F4A0B3' },
  takeawayText: { fontFamily: fonts.bodyMedium, fontSize: 17, lineHeight: 25, color: colors.white },
  h: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary },
  link: { flexDirection: 'row', alignItems: 'center', minHeight: 48, borderBottomWidth: 1, borderBottomColor: colors.border },
  linkText: { flex: 1, fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.violetDark },
  linkArrow: { fontFamily: fonts.label, fontSize: 16, color: colors.violetDark },
  reviewed: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, textAlign: 'center' },
  doneWrap: { alignItems: 'center', marginTop: space.xxl },
  doneTick: { fontSize: 56, color: colors.good, marginBottom: space.md }
});
