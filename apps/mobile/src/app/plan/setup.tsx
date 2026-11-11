// Reproductive Life Plan walk-through (owner, 4 Nov 2026: SOGC's "My Preconception Plan" adapted for Nigeria,
// guided by the result so nobody has to guess). One question per card: your plans → when → how you picture your
// family → what your result says → essentials already done → your next 3 months (suggestions ticked for her) →
// reminders → your support → questions for your provider → the plan on one page. With `?review=1` it is the plan
// review: the same cards, plus keep, finish or remove each goal. Choices are saved together on the last card.
// The essentials and provider questions are drafts until Dr Gloria approves them (planGuide.ts); until then only
// test builds show those cards, and goals come from the approved suggestions for the result's areas.
import Constants from 'expo-constants';
import { router, Stack, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, ActivityIndicator, Animated, PanResponder, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text } from '@/design/Text';
import {
  areaExplainer, essentialsFor, FAMILY_PICTURES, GROUP_LABEL, LEVEL_LABEL, PLAN_GUIDE_APPROVAL, suggestedGoals, suggestedQuestions,
  SUPPORT_OPTIONS, type FamilyPicture, type GuideInput, type SupportOption
} from '@preconnix/content';
import {
  createGoal, deleteGoal, getDashboard, getExplanation, getPlan, problemMessage, updateGoal, updatePlan,
  type Dashboard, type GoalCategory, type Horizon, type Intention, type Plan, type PlanGoal, type Rhythm
} from '@/core/api';
import { Body, Button, ChoiceGroup, Chip, ChipRow, Eyebrow, Screen } from '@/design/components';
import { Icon } from '@/design/Icon';
import { colors, fonts, radius, space } from '@/design/tokens';
import { Field, SectionLabel } from '@/features/plan/Field';
import { applyGoalReminder } from '@/features/plan/GoalReminder';
import { dateInMonths, formatDue, HORIZON_LABEL, INTENTION_LABEL, intentionLabel, RHYTHM_LABEL } from '@/features/plan/labels';
import { MAX_PICKS, offersFromAreas, REVIEW_MONTHS, toggleSupport, WEEKLY_REMINDER_DAY, type GoalOffer, type ReviewChoice } from '@/features/plan/setup';
import { TIME_OPTIONS } from '@/features/reminders/model';
import { deleteGoalReminders, deleteReminder, ensurePermission, saveReminder } from '@/features/reminders/store';

const REVIEW_REMINDER_ID = 'plan-review';
const ADVANCE_MS = 350;
const SWIPE = 60;
const NO_REMINDER = 'none';
const MAY_WANT: Intention[] = ['planning_now', 'planning_later', 'unsure'];
const REVIEW_LABEL: Record<ReviewChoice, string> = { keep: 'Keep going', done: "I've done it", remove: 'Remove it' };
/** The draft guide (essentials, questions) shows in test builds until Dr Gloria approves it. */
const GUIDE_ON = PLAN_GUIDE_APPROVAL.approved || Constants.expoConfig?.extra?.testBuild === true;

type Card =
  | { kind: 'intention' } | { kind: 'timing' } | { kind: 'family' } | { kind: 'keep'; goal: PlanGoal } | { kind: 'result' }
  | { kind: 'essentials' } | { kind: 'goals' } | { kind: 'reminder' } | { kind: 'support' } | { kind: 'questions' } | { kind: 'ready' };

export default function PlanWalkthrough() {
  const { review } = useLocalSearchParams<{ review?: string }>();
  const reviewing = review === '1';
  const [plan, setPlan] = useState<Plan | null>(null);
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [aiQuestions, setAiQuestions] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [pos, setPos] = useState(0);

  const [intention, setIntention] = useState<Intention | null>(null);
  const [horizon, setHorizon] = useState<Horizon | null>(null);
  const [family, setFamily] = useState<FamilyPicture | null>(null);
  const [kept, setKept] = useState<Record<string, ReviewChoice>>({});
  const [done, setDone] = useState<string[]>([]);
  const [picked, setPicked] = useState<string[] | null>(null);
  const [own, setOwn] = useState<{ title: string; rhythm: Rhythm } | null>(null);
  const [whyOpen, setWhyOpen] = useState<string | null>(null);
  const [reminder, setReminder] = useState<string>('1');
  const [support, setSupport] = useState<SupportOption[]>([]);
  const [questions, setQuestions] = useState<string[] | null>(null);
  const [ownQuestion, setOwnQuestion] = useState('');

  const [screenReader, setScreenReader] = useState(false);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const slide = useRef(new Animated.Value(0)).current;
  const latest = useRef({ back: () => {}, forward: () => {} });

  useEffect(() => {
    Promise.all([getPlan(), getDashboard()]).then(async ([p, d]) => {
      setPlan(p);
      setDash(d);
      // Her answer from the assessment starts it off: "no" there is the not-planning path. Asked again if she had
      // "Prefer not to say", which is no longer offered.
      setIntention(p.intention && p.intention !== 'prefer_not_say' ? p.intention : d.latestResult?.pathway === 'general_wellness' ? 'not_planning' : null);
      setHorizon(p.horizon);
      setFamily(p.familyPicture);
      setDone(p.essentialsDone);
      setSupport(p.support);
      if (p.providerQuestions.length) setQuestions(p.providerQuestions);
      // Questions from her AI-assisted explanation, when she has one (ADR-018).
      const e = d.latestResult ? await getExplanation(d.latestResult.assessmentId).catch(() => null) : null;
      if (e) setAiQuestions(e.areas.flatMap(a => a.askYourProvider));
    }).catch(e => setError(problemMessage(e)));
    AccessibilityInfo.isScreenReaderEnabled().then(setScreenReader);
    const sub = AccessibilityInfo.addEventListener('screenReaderChanged', setScreenReader);
    return () => { sub.remove(); clearTimeout(timer.current); };
  }, []);
  useEffect(() => { scrollRef.current?.scrollTo({ y: 0, animated: false }); }, [pos]);

  const swipe = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_e, g) => Math.abs(g.dx) > 16 && Math.abs(g.dx) > Math.abs(g.dy) * 2,
      onPanResponderRelease: (_e, g) => {
        if (g.dx > SWIPE) latest.current.back();
        else if (g.dx < -SWIPE) latest.current.forward();
      }
    })
  ).current;

  if (!plan || !dash) {
    return <Screen>{error ? <Body>{error}</Body> : <ActivityIndicator color={colors.violet} style={{ marginVertical: space.xl }} />}</Screen>;
  }

  // ── What the guide works out from her answers and her latest result ──
  const focus = dash.latestResult?.focus ?? [];
  const guide: GuideInput = { intention, pathway: dash.latestResult?.pathway ?? null, focus };
  const openGoals = plan.goals.filter(g => g.status === 'open');
  const keptGoals = openGoals.filter(g => !kept[g.id] || kept[g.id] === 'keep');
  const essentials = GUIDE_ON ? essentialsFor(guide) : [];
  const offers: GoalOffer[] = GUIDE_ON
    ? suggestedGoals(guide, done, openGoals.map(g => g.title)).slice(0, 8).map(o => ({
        key: o.essential.id, goal: o.essential.goal, domain: focus.find(f => o.essential.domains.includes(f.code))?.code ?? o.essential.domains[0] ?? null,
        why: o.essential.why, reason: o.essential.reason, preselected: o.preselected
      }))
    : offersFromAreas(focus.map(f => f.code), openGoals.map(g => g.title));
  const picks = picked ?? offers.filter(o => o.preselected).map(o => o.key);
  const chosen = offers.filter(o => picks.includes(o.key));
  const ownGoal = own?.title.trim() ? own : null;
  const repeating = [...chosen.map(o => o.goal.rhythm), ...(ownGoal ? [ownGoal.rhythm] : [])].some(r => r !== 'once');
  const offeredQuestions = GUIDE_ON ? suggestedQuestions(focus, aiQuestions) : aiQuestions.slice(0, 4);
  const allQuestions = [...new Set([...(questions ?? []), ...offeredQuestions])];
  const selectedQuestions = questions ?? offeredQuestions;

  const cards: Card[] = [
    { kind: 'intention' },
    ...(intention && MAY_WANT.includes(intention) ? [{ kind: 'timing' } as Card, { kind: 'family' } as Card] : []),
    ...(reviewing ? openGoals.map(goal => ({ kind: 'keep', goal }) as Card) : []),
    ...(focus.length ? [{ kind: 'result' } as Card] : []),
    ...(essentials.length ? [{ kind: 'essentials' } as Card] : []),
    { kind: 'goals' },
    ...(repeating ? [{ kind: 'reminder' } as Card] : []),
    { kind: 'support' },
    ...(allQuestions.length ? [{ kind: 'questions' } as Card] : []),
    { kind: 'ready' }
  ];
  const at = Math.min(pos, cards.length - 1);
  const card = cards[at];
  const progress = Math.round(((at + 1) / cards.length) * 100);

  const go = (i: number, direction: 1 | -1 = 1) => {
    clearTimeout(timer.current);
    slide.setValue(direction * 40);
    Animated.timing(slide, { toValue: 0, duration: 180, useNativeDriver: true }).start();
    setError(null);
    setPos(Math.max(0, Math.min(i, cards.length - 1)));
  };
  const answered = (): string | null => {
    switch (card.kind) {
      case 'intention': return intention ? null : 'Choose an answer to continue.';
      case 'timing': return horizon ? null : 'Choose an answer to continue.';
      case 'family': return family ? null : 'Choose an answer to continue.';
      case 'keep': return kept[card.goal.id] ? null : 'Choose what to do with this goal.';
      case 'goals': return chosen.length || ownGoal || keptGoals.length ? null : 'Choose at least one goal, or write your own.';
      default: return null;
    }
  };
  const next = () => {
    const missing = answered();
    if (missing) {
      setError(missing);
      AccessibilityInfo.announceForAccessibility(missing);
      return;
    }
    if (card.kind === 'ready') return finish();
    go(at + 1);
  };
  const back = () => (at > 0 ? go(at - 1, -1) : router.back());
  latest.current = { back, forward: next };
  // Picking an answer moves on by itself, except with a screen reader, where Next does.
  const autoAdvance = () => { if (!screenReader) timer.current = setTimeout(() => go(at + 1), ADVANCE_MS); };

  const togglePick = (key: string) => {
    if (picks.includes(key)) return setPicked(picks.filter(k => k !== key));
    if (picks.length + (ownGoal ? 1 : 0) >= MAX_PICKS) return setError(`Up to ${MAX_PICKS} goals at a time keeps it doable. Untick one to choose another.`);
    setError(null);
    setPicked([...picks, key]);
  };
  const toggleQuestion = (q: string) =>
    setQuestions(selectedQuestions.includes(q) ? selectedQuestions.filter(x => x !== q) : [...selectedQuestions, q]);
  const addOwnQuestion = () => {
    const q = ownQuestion.trim();
    if (!q) return;
    setQuestions([...selectedQuestions.filter(x => x !== q), q].slice(-10));
    setOwnQuestion('');
  };

  const finish = async () => {
    setBusy(true);
    setError(null);
    try {
      const planning = !!intention && MAY_WANT.includes(intention);
      await updatePlan({
        intention, horizon: planning ? horizon : null, familyPicture: planning ? family : null, support,
        essentialsDone: done, providerQuestions: selectedQuestions.slice(0, 10)
      });
      for (const g of openGoals) {
        const k = kept[g.id];
        if (k === 'done') await updateGoal(g.id, { status: 'done' });
        if (k === 'done' || k === 'remove') await deleteGoalReminders(g.id).catch(() => undefined);
        if (k === 'remove') await deleteGoal(g.id);
      }
      let remindersOff = false;
      const t = reminder === NO_REMINDER ? null : Number(reminder);
      const toCreate = [
        ...chosen.map(o => ({ title: o.goal.title, category: o.goal.category as GoalCategory, rhythm: o.goal.rhythm, domain: o.domain })),
        ...(ownGoal ? [{ title: ownGoal.title.trim(), category: 'other' as GoalCategory, rhythm: ownGoal.rhythm, domain: null }] : [])
      ];
      for (const p of toCreate) {
        const g = await createGoal({ category: p.category, title: p.title, rhythm: p.rhythm, ...(p.domain ? { sourceDomain: p.domain } : {}) });
        if (p.rhythm !== 'once' && !(await applyGoalReminder(g.id, g.title, p.rhythm, { time: t, weekday: WEEKLY_REMINDER_DAY }).catch(() => false))) remindersOff = true;
      }
      const reviewDate = dateInMonths(REVIEW_MONTHS);
      await updatePlan({ reviewDate, setupComplete: true });
      // A one-off phone reminder on the review date; the lock screen stays neutral.
      await deleteReminder(REVIEW_REMINDER_ID).catch(() => undefined);
      if (await ensurePermission().catch(() => false)) {
        await saveReminder({ id: REVIEW_REMINDER_ID, label: 'Review my plan', frequency: 'once', date: reviewDate!, hour: 9, minute: 0, showDetail: false, enabled: true }).catch(() => undefined);
      } else if (repeating && t !== null) remindersOff = true;
      router.dismissTo(remindersOff ? '/plan?note=reminders-off' : '/plan');
    } catch (e) {
      setError(`Your plan could not be saved. ${problemMessage(e)} Your choices are kept; try again.`);
      setBusy(false);
    }
  };

  const last = card.kind === 'ready';
  const planGoals = [...keptGoals.map(g => ({ title: g.title, rhythm: g.rhythm })), ...chosen.map(o => ({ title: o.goal.title, rhythm: o.goal.rhythm })), ...(ownGoal ? [ownGoal] : [])];
  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        <>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          {last ? (
            <>
              <Button label={busy ? 'Saving…' : reviewing ? 'Save my plan' : 'Start my plan'} onPress={next} disabled={busy} />
              <Text accessibilityRole="link" style={styles.backLink} onPress={back}>Go back and change something</Text>
            </>
          ) : (
            <View style={styles.buttons}>
              <View style={{ flex: 1 }}><Button label="Back" variant="secondary" onPress={back} disabled={busy} /></View>
              <View style={{ flex: 1 }}><Button label="Next" onPress={next} disabled={busy} /></View>
            </View>
          )}
        </>
      }
    >
      <Stack.Screen options={{ title: reviewing ? 'Review my plan' : 'My Reproductive Life Plan' }} />
      <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityLabel="Plan progress" accessibilityValue={{ min: 0, max: 100, now: progress }}>
        <View style={[styles.fill, { width: `${Math.max(progress, 3)}%` }]} />
      </View>

      <Animated.View {...swipe.panHandlers} style={{ transform: [{ translateX: slide }] }}>
        {card.kind === 'intention' ? (
          <>
            <Eyebrow>{reviewing ? 'Has anything changed?' : 'Your plans'}</Eyebrow>
            <ChoiceGroup
              label="What are your plans for pregnancy?"
              choices={(Object.keys(INTENTION_LABEL) as (keyof typeof INTENTION_LABEL)[]).map(i => ({ id: i, label: INTENTION_LABEL[i] }))}
              selected={intention ?? undefined}
              onSelect={id => { setIntention(id as Intention); setPicked(null); setError(null); autoAdvance(); }}
            />
          </>
        ) : null}

        {card.kind === 'timing' ? (
          <>
            <Eyebrow>Your plans</Eyebrow>
            <ChoiceGroup
              label="When might that be?"
              choices={(Object.keys(HORIZON_LABEL) as Horizon[]).map(h => ({ id: h, label: HORIZON_LABEL[h] }))}
              selected={horizon ?? undefined}
              onSelect={id => { setHorizon(id as Horizon); setError(null); autoAdvance(); }}
            />
          </>
        ) : null}

        {card.kind === 'family' ? (
          <>
            <Eyebrow>Your plans</Eyebrow>
            <ChoiceGroup
              label="How do you picture your family?"
              choices={(Object.keys(FAMILY_PICTURES) as FamilyPicture[]).map(f => ({ id: f, label: FAMILY_PICTURES[f] }))}
              selected={family ?? undefined}
              onSelect={id => { setFamily(id as FamilyPicture); setError(null); autoAdvance(); }}
            />
          </>
        ) : null}

        {card.kind === 'keep' ? (
          <>
            <Eyebrow>What next for this goal?</Eyebrow>
            <ChoiceGroup
              label={card.goal.title}
              choices={(Object.keys(REVIEW_LABEL) as ReviewChoice[]).map(k => ({ id: k, label: REVIEW_LABEL[k] }))}
              selected={kept[card.goal.id]}
              onSelect={id => { setKept(k => ({ ...k, [card.goal.id]: id as ReviewChoice })); setError(null); autoAdvance(); }}
            />
          </>
        ) : null}

        {card.kind === 'result' ? (
          <>
            <Eyebrow>From your result</Eyebrow>
            <Text style={styles.question} accessibilityRole="header">What your result says</Text>
            <Body>Score {dash.latestResult!.score}, {dash.latestResult!.bandLabel}. Your plan starts with these areas.</Body>
            {focus.map(f => {
              const x = areaExplainer(f);
              return (
                <View key={f.code} style={styles.areaCard}>
                  <View style={styles.areaHead}>
                    <Text style={[styles.optionTitle, { flex: 1 }]}>{f.name}</Text>
                    <Text style={[styles.level, x.level === 'priority' && styles.levelPriority]}>{LEVEL_LABEL[x.level]}</Text>
                  </View>
                  <Text style={styles.meta}>{x.text}</Text>
                </View>
              );
            })}
          </>
        ) : null}

        {card.kind === 'essentials' ? (
          <>
            <Eyebrow>Health essentials</Eyebrow>
            <Text style={styles.question} accessibilityRole="header">Which of these have you already done?</Text>
            <Body>Tick what you have done.</Body>
            {essentials.map((e, i) => (
              <View key={e.id}>
                {i === 0 || essentials[i - 1].recommended !== e.recommended ? (
                  <SectionLabel>{e.recommended ? 'Most important for you' : 'Good for everyone'}</SectionLabel>
                ) : null}
                <Check
                  on={done.includes(e.id)}
                  onPress={() => setDone(d => (d.includes(e.id) ? d.filter(x => x !== e.id) : [...d, e.id]))}
                  title={e.title}
                  meta={GROUP_LABEL[e.group]}
                />
              </View>
            ))}
          </>
        ) : null}

        {card.kind === 'goals' ? (
          <>
            <Eyebrow>Your next 3 months</Eyebrow>
            <Text style={styles.question} accessibilityRole="header">{reviewing ? 'Anything to add for the next 3 months?' : 'Here is where we suggest you start'}</Text>
            <Body>{reviewing ? 'Tick any new goals, or none.' : 'We ticked a few to start. Change them if you like.'}</Body>
            {offers.map(o => (
              <View key={o.key}>
                <Check
                  on={picks.includes(o.key)}
                  onPress={() => togglePick(o.key)}
                  title={o.goal.title}
                  meta={[o.goal.rhythm === 'once' ? 'Once' : RHYTHM_LABEL[o.goal.rhythm], o.reason].filter(Boolean).join(' · ')}
                />
                {o.why ? (
                  whyOpen === o.key
                    ? <Text style={styles.why}>{o.why}</Text>
                    : <Text accessibilityRole="button" style={styles.whyLink} onPress={() => setWhyOpen(o.key)}>Why this?</Text>
                ) : null}
              </View>
            ))}
            {own ? (
              <View style={styles.ownBox}>
                <Field label="Your own goal" value={own.title} onChangeText={t => setOwn({ ...own, title: t })} placeholder="e.g. Drink more water" maxLength={120} autoFocus />
                <SectionLabel>How often</SectionLabel>
                <ChipRow label="How often">
                  {(Object.keys(RHYTHM_LABEL) as Rhythm[]).map(r => <Chip key={r} label={RHYTHM_LABEL[r]} selected={own.rhythm === r} onPress={() => setOwn({ ...own, rhythm: r })} />)}
                </ChipRow>
              </View>
            ) : (
              <Text accessibilityRole="button" style={styles.addLink} onPress={() => setOwn({ title: '', rhythm: 'once' })}>+ Write my own goal</Text>
            )}
          </>
        ) : null}

        {card.kind === 'reminder' ? (
          <>
            <Eyebrow>Check-ins</Eyebrow>
            <ChoiceGroup
              label="When should we remind you to check in?"
              choices={[...TIME_OPTIONS.map((t, i) => ({ id: String(i), label: t.label })), { id: NO_REMINDER, label: 'No reminders' }]}
              selected={reminder}
              onSelect={id => { setReminder(id); autoAdvance(); }}
            />
          </>
        ) : null}

        {card.kind === 'support' ? (
          <>
            <Eyebrow>Your support</Eyebrow>
            <Text style={styles.question} accessibilityRole="header">Who can support you along the way?</Text>
            {(Object.keys(SUPPORT_OPTIONS) as SupportOption[]).map(o => (
              <Check key={o} on={support.includes(o)} onPress={() => setSupport(s => toggleSupport(s, o, 'no_one_yet'))} title={SUPPORT_OPTIONS[o]} />
            ))}
            {support.includes('no_one_yet') ? (
              <Text style={styles.why}>That is okay. A health worker or a PreConnix doctor can help.</Text>
            ) : null}
          </>
        ) : null}

        {card.kind === 'questions' ? (
          <>
            <Eyebrow>Questions for your provider</Eyebrow>
            <Text style={styles.question} accessibilityRole="header">What would you like to ask at your next visit?</Text>
            <Body>Keep the ones you want.</Body>
            {allQuestions.map(q => (
              <Check key={q} on={selectedQuestions.includes(q)} onPress={() => toggleQuestion(q)} title={q} tag={aiQuestions.includes(q) ? 'AI-Explainer' : undefined} />
            ))}
            <Field label="Add your own question" value={ownQuestion} onChangeText={setOwnQuestion} placeholder="e.g. Is my weight healthy for pregnancy?" maxLength={200} />
            {ownQuestion.trim() ? <Text accessibilityRole="button" style={styles.addLink} onPress={addOwnQuestion}>+ Add this question</Text> : null}
          </>
        ) : null}

        {card.kind === 'ready' ? (
          <>
            <Eyebrow>{reviewing ? 'Your updated plan' : 'All set'}</Eyebrow>
            <Text style={styles.question} accessibilityRole="header">My Reproductive Life Plan</Text>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>My plans</Text>
              <Text style={styles.meta}>
                {intentionLabel(intention) ?? 'Not said'}
                {intention && MAY_WANT.includes(intention) && horizon ? ` · ${HORIZON_LABEL[horizon].toLowerCase()}` : ''}
                {intention && MAY_WANT.includes(intention) && family ? ` · ${FAMILY_PICTURES[family]}` : ''}
              </Text>
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>My next 3 months</Text>
              {planGoals.map(g => (
                <View key={g.title} style={styles.readyRow}>
                  <Icon name="check" size={18} color={colors.violet} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.optionTitle}>{g.title}</Text>
                    <Text style={styles.meta}>{RHYTHM_LABEL[g.rhythm]}</Text>
                  </View>
                </View>
              ))}
              {!planGoals.length ? <Body muted>No goals yet. You can add one from your plan at any time.</Body> : null}
            </View>
            <View style={styles.card}>
              <Text style={styles.sectionTitle}>My support</Text>
              <Text style={styles.meta}>{support.length ? support.map(s => SUPPORT_OPTIONS[s]).join(', ') : 'Not chosen yet'}</Text>
            </View>
            {selectedQuestions.length ? (
              <View style={styles.card}>
                <Text style={styles.sectionTitle}>Questions for my provider</Text>
                {selectedQuestions.map(q => <Text key={q} style={styles.meta}>•  {q}</Text>)}
              </View>
            ) : null}
            <Body>Review on {formatDue(dateInMonths(REVIEW_MONTHS))}. You can share it as a PDF from My plan.</Body>
          </>
        ) : null}
      </Animated.View>
    </Screen>
  );
}

/** A tickable row (checkbox semantics) with an optional tag such as "For you". */
function Check({ on, onPress, title, meta, tag }: { on: boolean; onPress: () => void; title: string; meta?: string; tag?: string }) {
  return (
    <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} accessibilityLabel={[title, tag, meta].filter(Boolean).join(', ')} onPress={onPress} style={[styles.option, on && styles.optionOn]}>
      <View style={[styles.box, on && styles.boxOn]}>{on ? <Icon name="check" size={16} color={colors.white} /> : null}</View>
      <View style={{ flex: 1 }}>
        <Text style={styles.optionTitle}>{title}</Text>
        {meta ? <Text style={styles.meta}>{meta}</Text> : null}
      </View>
      {tag ? <Text style={styles.tag}>{tag}</Text> : null}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  track: { height: 6, borderRadius: 3, backgroundColor: colors.violetWash, overflow: 'hidden', marginBottom: space.lg },
  fill: { height: 6, borderRadius: 3, backgroundColor: colors.violet },
  question: { fontFamily: fonts.heading, fontSize: 22, lineHeight: 28, color: colors.textPrimary, marginBottom: space.sm },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginTop: space.sm, minHeight: 56 },
  optionOn: { borderColor: colors.violet, backgroundColor: colors.violetWash },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#B7ABC4', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  optionTitle: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
  tag: { fontFamily: fonts.label, fontSize: 11, color: colors.roseDark, backgroundColor: colors.roseWash, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 3, overflow: 'hidden' },
  areaCard: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginTop: space.sm },
  areaHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 4 },
  level: { fontFamily: fonts.label, fontSize: 12, color: colors.violetDark },
  levelPriority: { color: colors.roseDark },
  why: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, backgroundColor: colors.violetWash, borderRadius: radius.sm, padding: space.md, marginTop: space.xs },
  whyLink: { fontFamily: fonts.label, fontSize: 13, color: colors.violetDark, paddingVertical: space.xs, paddingHorizontal: space.md },
  addLink: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark, paddingVertical: space.md },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.md, gap: space.sm },
  sectionTitle: { fontFamily: fonts.heading, fontSize: 16, color: colors.textPrimary },
  readyRow: { flexDirection: 'row', gap: space.md, alignItems: 'flex-start' },
  ownBox: { marginTop: space.md },
  buttons: { flexDirection: 'row', gap: space.sm },
  backLink: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark, textAlign: 'center', paddingVertical: space.sm },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert }
});
