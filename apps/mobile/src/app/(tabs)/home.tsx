// Home (owner's order, 30 Oct 2026): score and traffic-light band, the plan step, Learning and Circle side by side,
// booking a consultation with a medical doctor, then the assessment report links. Before the first assessment
// the plan step becomes "Start my assessment". Cards that need a result are left out until there is one.
import * as WebBrowser from 'expo-web-browser';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { getDashboard, getPlan, problemMessage, type Dashboard, type Plan } from '@/core/api';
import { Button, Screen } from '@/design/components';
import { Icon } from '@/design/Icon';
import { TabHeader } from '@/design/TabHeader';
import { colors, fonts, radius, space } from '@/design/tokens';
import { completedLessons } from '@/features/learn/progress';
import { useContent } from '@/features/content/store';
import { goalProgress, localDay } from '@/features/plan/progress';
import { BAND_STYLE } from '@/features/results/bands';
import { formatDate } from '@/features/results/ResultView';

const greeting = (h = new Date().getHours()) => (h < 12 ? 'Good morning' : h < 18 ? 'Good afternoon' : 'Good evening');

function Link({ label, onPress }: { label: string; onPress: () => void }) {
  return <Text accessibilityRole="link" style={styles.link} onPress={onPress} suppressHighlighting>{label}</Text>;
}

export default function Home() {
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [problem, setProblem] = useState<string | null>(null);
  const [done, setDone] = useState<Set<string>>(new Set());

  const load = useCallback(() => {
    Promise.all([getDashboard(), getPlan()])
      .then(([d, p]) => { setDash(d); setPlan(p); setProblem(null); })
      .catch(e => setProblem(problemMessage(e)));
    completedLessons().then(setDone);
  }, []);
  useFocusEffect(load);

  const { lessons, settings } = useContent();
  const lesson = lessons.find(l => !done.has(l.id)) ?? lessons[0];
  const latest = dash?.latestResult ?? null;
  const today = localDay();
  const due = (plan?.goals ?? []).filter(g => goalProgress(g, today).due);
  const hasGoals = (plan?.goals ?? []).some(g => g.status === 'open');
  const toPlan = () => router.navigate('/plan');
  const openReport = () => latest && router.push(`/history/${latest.assessmentId}` as never);

  // The plan step, from the person's state.
  const step = !dash
    ? null
    : !latest
      ? { eyebrow: 'Your next step', title: 'Understand your reproductive health.', body: 'A short assessment shows the areas of your preconception health that may deserve attention.', cta: 'Start my assessment', go: () => router.push('/assess/profile') }
      : !hasGoals
        ? { eyebrow: 'Your next step', title: 'Create your plan.', body: 'Turn your result into a few small goals you tick off as you go. It takes about two minutes.', cta: 'Create my plan', go: () => router.push((plan?.setupComplete ? '/plan' : '/plan/setup') as never) }
        : due.length
          ? { eyebrow: 'Today', title: due.length === 1 ? `Check in: ${due[0].title}` : 'Check in on your goals.', body: 'A quick tap keeps your progress and streaks up to date.', cta: 'Check in', go: toPlan }
          : { eyebrow: 'Your plan', title: dash.nextActions[0]?.title ?? 'Keep going with your plan.', body: dash.nextActions[0] ? `For: ${dash.nextActions[0].goalTitle}` : 'Review your goals and add the next small step.', cta: 'Continue my plan', go: toPlan };

  const band = latest ? BAND_STYLE[latest.band] : null;

  return (
    <Screen top>
      <TabHeader eyebrow="Your space, your pace" title={dash?.firstName ? `${greeting()}, ${dash.firstName}` : greeting()} subtitle="One useful step for today." />
      {problem ? <Text style={styles.problem}>{problem}</Text> : null}

      {latest && band ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`Your Reproductive Health Score: ${latest.score} out of 100, ${latest.bandLabel}. Open your report.`}
          onPress={openReport}
          style={({ pressed }) => [styles.card, styles.scoreCard, pressed && { opacity: 0.9 }]}
        >
          <View style={{ flex: 1 }}>
            <Text style={styles.eyebrow}>Your Reproductive Health Score</Text>
            <Text style={styles.score}>{latest.score}<Text style={styles.outOf}>/100</Text></Text>
            <Text style={styles.small}>{formatDate(latest.computedAt)}</Text>
          </View>
          <View style={[styles.bandPill, { backgroundColor: band.bg }]}>
            <View style={[styles.dot, { backgroundColor: band.dot }]} />
            <Text style={[styles.bandText, { color: band.fg }]}>{latest.bandLabel}</Text>
          </View>
        </Pressable>
      ) : null}

      {step ? (
        <View style={styles.step}>
          <Text style={styles.eyebrow}>{step.eyebrow}</Text>
          <Text style={styles.stepTitle} accessibilityRole="header">{step.title}</Text>
          <Text style={styles.body}>{step.body}</Text>
          <Button label={step.cta} onPress={step.go} />
        </View>
      ) : null}

      <View style={styles.pair}>
        {lesson ? (
          <Pressable accessibilityRole="button" accessibilityLabel={`A little learning: ${lesson.title}, ${lesson.minutes} minutes`} onPress={() => router.push(`/learn/${lesson.id}` as never)} style={[styles.card, styles.half]}>
            <Icon name="learn" size={22} color={colors.roseDark} />
            <Text style={styles.cardTitle}>A little learning</Text>
            <Text style={styles.small}>{lesson.title} · {lesson.minutes} min</Text>
            <Text style={styles.link}>Open Learn</Text>
          </Pressable>
        ) : null}
        <Pressable accessibilityRole="button" accessibilityLabel="Your Circle: conversations and shared experiences" onPress={() => router.navigate('/circle')} style={[styles.card, styles.half]}>
          <Icon name="circle" size={22} color={colors.roseDark} />
          <Text style={styles.cardTitle}>Your Circle</Text>
          <Text style={styles.small}>Conversations and shared experiences</Text>
          <Text style={styles.link}>Join in</Text>
        </Pressable>
      </View>

      {/* Always shown on Home (owner, 30 Oct 2026), whatever the country. */}
      <View style={styles.card}>
        <View style={styles.row}>
          <View style={styles.iconTile}><Icon name="calendar" size={22} color={colors.roseDark} /></View>
          <Text style={[styles.cardTitle, { flex: 1 }]} accessibilityRole="header">Talk to a medical doctor</Text>
        </View>
        <Text style={styles.body}>Book a one-on-one consultation to talk through your results and your plan.</Text>
        <Button label="Book a consultation" onPress={() => WebBrowser.openBrowserAsync(settings.consultationUrl)} />
      </View>

      {latest ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle} accessibilityRole="header">Your assessment</Text>
          <Text style={styles.body}>Your report from {formatDate(latest.computedAt)}, with your focus areas.</Text>
          <View style={styles.links}>
            <Link label="View report" onPress={openReport} />
            <Link label="See your plan" onPress={toPlan} />
          </View>
        </View>
      ) : null}
      {latest ? <Text accessibilityRole="link" style={styles.retake} onPress={() => router.push('/assess/profile')}>Retake the assessment</Text> : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  problem: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.alert, marginBottom: space.sm },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.md, gap: 6 },
  scoreCard: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  eyebrow: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.4, textTransform: 'uppercase', color: colors.violetDark },
  score: { fontFamily: fonts.headingBlack, fontSize: 44, lineHeight: 50, color: colors.textPrimary },
  outOf: { fontFamily: fonts.label, fontSize: 18, color: colors.textSecondary },
  bandPill: { flexDirection: 'row', alignItems: 'center', gap: 8, borderRadius: radius.pill, paddingHorizontal: 14, paddingVertical: 10, maxWidth: '55%' },
  dot: { width: 12, height: 12, borderRadius: 6 },
  bandText: { fontFamily: fonts.label, fontSize: 14, flexShrink: 1 },
  step: { backgroundColor: colors.violetWash, borderRadius: radius.md, padding: space.xl, marginBottom: space.md, gap: space.sm },
  stepTitle: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 27, color: colors.textPrimary },
  cardTitle: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 22, color: colors.textPrimary },
  body: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textSecondary },
  small: { fontFamily: fonts.body, fontSize: 13, lineHeight: 18, color: colors.textSecondary, flexGrow: 1 },
  links: { flexDirection: 'row', flexWrap: 'wrap', columnGap: space.xl, marginTop: space.xs },
  link: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark, paddingVertical: 8 },
  pair: { flexDirection: 'row', gap: space.md },
  half: { flex: 1, minHeight: 160 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  retake: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.violetDark, textAlign: 'center', paddingVertical: space.md },
  iconTile: { width: 44, height: 44, borderRadius: 12, backgroundColor: colors.roseWash, alignItems: 'center', justifyContent: 'center' }
});
