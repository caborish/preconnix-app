// One question per card (owner feedback, 30 Oct 2026). Choosing an answer moves on to the next card by itself,
// except with a screen reader on, where moving on is left to the Next button. Swiping right goes back a card to
// change an answer. Only a progress bar shows how far along the person is: no question numbers or counts.
// A missed question is shown, never a silent stop. `q` opens a given question; `from=finish` returns to the
// results step once every gap is filled.
import { countOption, followUpOpen, noteFor } from '@preconnix/assessment-engine/routing';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, Animated, PanResponder, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text } from '@/design/Text';
import { Body, Button, Chip, ChipRow, ChoiceGroup, Divider, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { nextRoute, useDraft } from '@/features/assessment/draft';
import { Field } from '@/features/plan/Field';

const ADVANCE_MS = 350;
const SWIPE = 60;

export default function SectionScreen() {
  const { sectionId, q, from } = useLocalSearchParams<{ sectionId: string; q?: string; from?: string }>();
  const draft = useDraft();
  const index = draft.sections.findIndex(s => s.id === sectionId);
  const section = draft.sections[index];
  const fixing = from === 'finish';

  const [pos, setPos] = useState(() => {
    if (!section) return 0;
    const asked = q ? section.questions.findIndex(x => x.id === q) : -1;
    if (asked >= 0) return asked;
    const open = section.questions.findIndex(x => !draft.answers[x.id]);
    return open >= 0 ? open : 0;
  });
  const [error, setError] = useState<string | null>(null);
  const [screenReader, setScreenReader] = useState(false);
  const [reduceMotion, setReduceMotion] = useState(false);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const slide = useRef(new Animated.Value(0)).current;
  // The timer reads answers after the re-render that saved the new one.
  const answers = useRef(draft.answers);
  answers.current = draft.answers;
  // Set after jumping back to a missed question, so answering it carries on rather than replaying answered cards.
  const returning = useRef(false);
  // Gesture handlers are created once; they call the latest render's functions through this ref.
  const latest = useRef({ back: () => {}, forward: () => {}, advance: () => {} });

  useEffect(() => {
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    AccessibilityInfo.isReduceMotionEnabled().then(setReduceMotion);
    const subs = [
      AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader),
      AccessibilityInfo.addEventListener('reduceMotionChanged', setReduceMotion)
    ];
    return () => { subs.forEach(s => s.remove()); clearTimeout(timer.current); };
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [pos]);

  const swipe = useRef(
    PanResponder.create({
      // Only clearly sideways drags; vertical scrolling and taps on answers are left alone.
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE) latest.current.back();
        else if (g.dx < -SWIPE) latest.current.forward();
      }
    })
  ).current;

  if (!section) {
    // Section no longer applies (e.g. the profile changed). Go back to the profile step.
    return (
      <Screen footer={<Button label="Back to About you" onPress={() => router.replace('/assess/profile')} />}>
        <Title>This section doesn't apply</Title>
        <Body>Your answers on the profile step changed which questions apply to you.</Body>
      </Screen>
    );
  }

  // An earlier answer can remove a later question, so the position is kept within the list.
  const question = section.questions[Math.min(pos, section.questions.length - 1)];
  const all = draft.sections.flatMap(s => s.questions.map(x => ({ sectionId: s.id, id: x.id })));
  const progress = Math.round((all.filter(x => draft.answers[x.id]).length / all.length) * 100);

  const show = (i: number, message: string | null, direction: 1 | -1 = 1) => {
    clearTimeout(timer.current);
    if (i !== pos && !reduceMotion) {
      slide.setValue(direction * 40);
      Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    }
    setPos(i);
    setError(message);
    if (message) AccessibilityInfo.announceForAccessibility(message);
  };

  const advance = () => {
    const done = answers.current;
    if (fixing) {
      // On to the results once every gap is filled; otherwise on to the next gap, wherever it is.
      const gap = all.find(x => !done[x.id]);
      if (!gap) return router.replace('/assess/review' as never);
      if (gap.sectionId === section.id) return show(section.questions.findIndex(x => x.id === gap.id), null);
      return router.replace(`/assess/section/${gap.sectionId}?q=${gap.id}&from=finish` as never);
    }
    const missed = section.questions.findIndex(x => !done[x.id]);
    if (returning.current) {
      returning.current = missed >= 0;
      if (missed >= 0) return show(missed, null);
      return router.push(nextRoute(draft.sections, section.id) as never);
    }
    if (pos < section.questions.length - 1) return show(pos + 1, null);
    if (missed >= 0) {
      returning.current = true;
      return show(missed, 'This question still needs an answer.', -1);
    }
    router.push(nextRoute(draft.sections, section.id) as never);
  };

  const back = () => {
    returning.current = false;
    if (pos > 0) show(pos - 1, null, -1);
    else if (index > 0 && router.canGoBack()) router.back();
  };

  const counts = question.pregnancyCounts;
  const countProblem = () => {
    const { gravida, parity } = draft.numbers;
    if (!Number.isInteger(gravida) || gravida < 1 || gravida > counts!.max) return 'Please enter the number of pregnancies.';
    if (!Number.isInteger(parity) || parity < 0 || parity > gravida) return 'The second number cannot be more than the first.';
    return null;
  };
  const setCount = (id: 'gravida' | 'parity', text: string) => {
    const n = parseInt(text, 10);
    draft.setNumber(id, Number.isFinite(n) ? n : null);
    if (id === 'gravida' && Number.isFinite(n) && n >= 1) draft.setAnswer(question.id, countOption(question, n)!);
    setError(null);
  };

  const onNext = () => {
    if (counts) {
      const problem = countProblem();
      if (problem) {
        setError(problem);
        AccessibilityInfo.announceForAccessibility(problem);
        return;
      }
    }
    if (!answers.current[question.id]) {
      setError('Choose an answer to continue.');
      AccessibilityInfo.announceForAccessibility('Choose an answer to continue.');
      return;
    }
    advance();
  };
  latest.current = { back, forward: onNext, advance };

  const onSelect = (optionId: string) => {
    draft.setAnswer(question.id, optionId);
    setError(null);
    clearTimeout(timer.current);
    // A tick-list stays open until she taps Next. The timer uses the next render's list, which this answer can change.
    if (!screenReader && !followUpOpen(question, optionId) && !noteFor(question, optionId)) timer.current = setTimeout(() => latest.current.advance(), ADVANCE_MS);
  };

  const first = pos === 0 && index === 0;

  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        <>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <View style={styles.buttons}>
            {!first ? (
              <View style={{ flex: 1 }}><Button label="Back" variant="secondary" onPress={back} /></View>
            ) : null}
            <View style={{ flex: 1 }}><Button label="Next" onPress={onNext} /></View>
          </View>
        </>
      }
    >
      <Stack.Screen options={{ title: section.tag }} />
      <View
        style={styles.track}
        accessible
        accessibilityRole="progressbar"
        accessibilityLabel="Assessment progress"
        accessibilityValue={{ min: 0, max: 100, now: progress }}
      >
        <View style={[styles.fill, { width: `${Math.max(progress, 3)}%` }]} />
      </View>
      {section.tag ? <Eyebrow>{section.tag}</Eyebrow> : null}
      <Text style={styles.sectionTitle} accessibilityRole="header">{section.title}</Text>
      {pos === 0 && section.subtitle ? <Body>{section.subtitle}</Body> : null}
      <Animated.View {...swipe.panHandlers} style={{ transform: [{ translateX: slide }] }}>
        {question.sectionDivider ? <Divider>{question.sectionDivider}</Divider> : null}
        {counts ? (
          <View key={question.id}>
            <Field label={counts.gravidaLabel} keyboardType="number-pad" maxLength={2} value={draft.numbers.gravida === undefined ? '' : String(draft.numbers.gravida)} onChangeText={t => setCount('gravida', t)} />
            <Field label={counts.parityLabel} keyboardType="number-pad" maxLength={2} value={draft.numbers.parity === undefined ? '' : String(draft.numbers.parity)} onChangeText={t => setCount('parity', t)} />
          </View>
        ) : (
          <ChoiceGroup
            key={question.id}
            label={question.text}
            choices={question.options}
            selected={draft.answers[question.id]}
            error={!!error && !draft.answers[question.id]}
            onSelect={onSelect}
          />
        )}
        {noteFor(question, draft.answers[question.id]) ? (
          <View style={styles.note} accessibilityLiveRegion="polite"><Text style={styles.noteText}>{noteFor(question, draft.answers[question.id])}</Text></View>
        ) : null}
        {followUpOpen(question, draft.answers[question.id]) ? (
          <View style={styles.followUp}>
            <Text style={styles.followUpPrompt}>{question.followUp!.prompt}</Text>
            <ChipRow label={question.followUp!.prompt}>
              {question.followUp!.options.map(o => (
                <Chip key={o.id} label={o.label} selected={(draft.followUps[question.id] ?? []).includes(o.id)} onPress={() => draft.toggleFollowUp(question.id, o.id)} />
              ))}
            </ChipRow>
            {(draft.followUps[question.id] ?? []).includes('other') ? (
              <Field label="Other" maxLength={120} value={draft.followUpOther[question.id] ?? ''} onChangeText={t => draft.setFollowUpOther(question.id, t)} />
            ) : null}
          </View>
        ) : null}
        {!first ? <Text style={styles.hint} importantForAccessibility="no">Swipe right to go back</Text> : null}
      </Animated.View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: colors.violetWash, overflow: 'hidden', marginBottom: space.lg },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.violet },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary, marginBottom: space.md },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert },
  followUp: { marginTop: space.md },
  note: { backgroundColor: colors.roseWash, borderRadius: radius.sm, padding: space.md, marginTop: space.sm },
  noteText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  followUpPrompt: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.textPrimary, marginBottom: space.sm },
  buttons: { flexDirection: 'row', gap: space.sm },
  hint: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: space.xs }
});
