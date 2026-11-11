// Plan tab: "My Reproductive Life Plan" laid out like a booklet (Dr Gloria, 4 Nov 2026: fewer words, easier to move
// around; benchmark: Best Start's "My Reproductive Life Plan"). Her plan in one line, then sections that open and
// close: Today, My goals, Health essentials, My support, Questions for my provider. "Share my plan" makes the PDF,
// which is the plan's aim. Before a plan exists: three short reasons and "Generate my plan" (Dr Gloria, 5 Nov 2026:
// a plan appears only when she asks for one).
import Constants from 'expo-constants';
import * as WebBrowser from 'expo-web-browser';
import { router, useFocusEffect, useLocalSearchParams } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { essentialsFor, FAMILY_PICTURES, PLAN_GUIDE_APPROVAL, SUPPORT_OPTIONS, VACCINES } from '@preconnix/content';
import { checkIn, getDashboard, getPlan, problemMessage, undoCheckIn, type Dashboard, type Plan, type PlanGoal } from '@/core/api';
import { Body, Button, Screen } from '@/design/components';
import { Icon, type IconName } from '@/design/Icon';
import { TabHeader } from '@/design/TabHeader';
import { colors, fonts, radius, space } from '@/design/tokens';
import { canBookConsultation, useContent } from '@/features/content/store';
import { formatDue, HORIZON_LABEL, intentionLabel } from '@/features/plan/labels';
import { asksAmount, goalProgress, localDay, progressLine } from '@/features/plan/progress';
import { CATEGORY_ICON, planDocument, sharePlan } from '@/features/plan/sharePlan';
import { SupportCard } from '@/features/plan/SupportCard';

const GUIDE_ON = PLAN_GUIDE_APPROVAL.approved || Constants.expoConfig?.extra?.testBuild === true;

// Why a plan: Dr Gloria's approved titles (1 Nov 2026), shown without the longer lines (4 Nov 2026).
const WHY = [
  { icon: 'shield', title: 'Doctors recommend it' },
  { icon: 'heart', title: 'The best time is before' },
  { icon: 'check', title: 'Small steps add up' }
] as const;

type SectionId = 'today' | 'goals' | 'support' | 'questions' | 'private';

export default function MyPlan() {
  const { settings } = useContent();
  const { note: noteParam } = useLocalSearchParams<{ note?: string }>();
  const [dash, setDash] = useState<Dashboard | null>(null);
  const [plan, setPlan] = useState<Plan | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState<SectionId | null | undefined>(undefined);
  const [sharing, setSharing] = useState(false);

  const load = useCallback(() => {
    setError(null);
    Promise.all([getDashboard(), getPlan()])
      .then(([d, p]) => { setDash(d); setPlan(p); })
      .catch(e => setError(problemMessage(e)));
  }, []);
  useFocusEffect(load);

  const today = localDay();
  const quickCheckIn = (g: PlanGoal) => {
    if (asksAmount(g.target)) return router.push(`/plan/goal/${g.id}` as never);
    const done = goalProgress(g, today).checkedToday;
    (done ? undoCheckIn(g.id, today) : checkIn(g.id, today)).then(load).catch(e => setError(problemMessage(e)));
  };

  const goals = plan?.goals ?? [];
  const openGoals = goals.filter(g => g.status === 'open');
  const doneGoals = goals.filter(g => g.status === 'done');
  const repeating = openGoals.filter(g => g.rhythm !== 'once');
  const oneOff = openGoals.filter(g => g.rhythm === 'once');
  const checkedToday = repeating.filter(g => !goalProgress(g, today).due).length;
  const fresh = !!plan && !plan.setupComplete && openGoals.length === 0;
  const reviewDue = !!plan?.reviewDate && plan.reviewDate <= today;
  // The first section starts open: Today when there are check-ins, otherwise My goals.
  const shown = open === undefined ? (repeating.length ? 'today' : 'goals') : open;
  const toggle = (id: SectionId) => setOpen(shown === id ? null : id);

  // Private support stays off the shared plan unless she chooses to include it (Dr Gloria, Review 3).
  const privateSupport = dash?.latestResult?.support ?? [];
  const share = () => {
    if (!privateSupport.length) return makePdf(false);
    Alert.alert('Include private support?', 'This adds your private support topics to the PDF you share.', [
      { text: 'Leave it out', style: 'cancel', onPress: () => makePdf(false) },
      { text: 'Include it', onPress: () => makePdf(true) }
    ]);
  };
  const makePdf = async (includePrivate: boolean) => {
    if (!plan || !dash) return;
    setSharing(true);
    setError(null);
    try {
      const doc = planDocument(plan, dash, GUIDE_ON);
      await sharePlan(includePrivate ? { ...doc, support: [...doc.support, ...privateSupport.map(m => m.title)] } : doc);
    } catch (e) {
      setError(`Your plan could not be shared. ${e instanceof Error ? e.message : ''}`.trim());
    } finally {
      setSharing(false);
    }
  };

  const essentials = plan && GUIDE_ON ? essentialsFor({ intention: plan.intention, pathway: dash?.latestResult?.pathway ?? null, focus: dash?.latestResult?.focus ?? [], only: plan.essentialsFocus }) : [];
  const essentialsDone = essentials.filter(e => plan?.essentialsDone.includes(e.id)).length;
  const statement = plan ? [
    intentionLabel(plan.intention),
    plan.horizon ? HORIZON_LABEL[plan.horizon] : null,
    plan.familyPicture ? FAMILY_PICTURES[plan.familyPicture] : null
  ].filter(Boolean).join(' · ') : '';
  const vaccinesHad = plan ? VACCINES.filter(v => plan.essentialsDone.includes(v.id)).length : 0;
  const allGoals = openGoals.length + doneGoals.length;
  const showVaccines = !plan?.essentialsFocus || plan.essentialsFocus.includes('vaccines');
  // A retake, or a plan made before plans were generated from answers: offer to bring it up to date.
  const latest = dash?.latestResult;
  const planBehind = !!plan && !fresh && !!latest && plan.sourceAssessmentId !== latest.assessmentId;

  return (
    <Screen top>
      <TabHeader title="My plan" />
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      {noteParam === 'reminders-off' ? <Text style={styles.note}>Plan saved. Reminders are off: turn on notifications in your phone Settings.</Text> : null}
      {!plan && !error ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} /> : null}

      {fresh ? (
        <View style={styles.intro}>
          <Text style={styles.introTitle} accessibilityRole="header">Small steps today. A healthier tomorrow.</Text>
          {WHY.map(x => (
            <View key={x.title} style={styles.point}>
              <View style={styles.pointIcon}><Icon name={x.icon} size={20} color={colors.roseDark} /></View>
              <Text style={styles.pointTitle}>{x.title}</Text>
            </View>
          ))}
          <View style={{ marginTop: space.sm }}>
            {dash?.latestResult ? (
              <Button label="Generate my plan" onPress={() => router.push('/plan/generate' as never)} />
            ) : (
              <Button label="Take the assessment first" onPress={() => router.push('/assess/profile')} />
            )}
          </View>
          <Text style={styles.small}>About 3 minutes</Text>
        </View>
      ) : null}

      {plan && !fresh ? (
        <>
          <Pressable accessibilityRole="button" accessibilityLabel={`My plan: ${statement || 'not chosen'}. Edit`} onPress={() => router.push('/plan/setup?review=1' as never)} style={styles.statement}>
            <View style={{ flex: 1 }}>
              <Text style={styles.statementLabel}>My Reproductive Life Plan</Text>
              <Text style={styles.statementText}>{statement || 'Choose your plans'}</Text>
            </View>
            <Icon name="edit" size={20} color={colors.violetDark} />
          </Pressable>

          {/* At a glance (Dr Gloria, 5 Nov 2026: visual, like a dashboard). */}
          <View style={styles.board}>
            <Tile icon="plan" value={`${doneGoals.length}/${allGoals}`} label="Goals done" onPress={() => setOpen('goals')} />
            {GUIDE_ON && plan.setupComplete && essentials.length ? <Tile icon="clipboard" value={`${essentialsDone}/${essentials.length}`} label="Essentials" onPress={() => router.push('/plan/essentials' as never)} /> : null}
            {GUIDE_ON && plan.setupComplete && showVaccines ? <Tile icon="shield" value={`${vaccinesHad}/${VACCINES.length}`} label="Vaccines" onPress={() => router.push('/plan/essentials' as never)} /> : null}
          </View>

          {planBehind ? (
            <View style={styles.review}>
              <Text style={styles.cardTitle} accessibilityRole="header">{plan.sourceAssessmentId ? 'You have a new result' : 'Match your plan to your answers'}</Text>
              <Text style={styles.reviewText}>Update your plan so it matches your latest answers.</Text>
              <Button label="Update my plan" onPress={() => router.push('/plan/generate' as never)} />
            </View>
          ) : null}

          {(reviewDue || !plan.setupComplete) && !planBehind ? (
            <View style={styles.review}>
              <Text style={styles.cardTitle} accessibilityRole="header">{reviewDue ? 'Time to review your plan' : 'Finish your plan'}</Text>
              <Button label={reviewDue ? 'Review my plan' : 'Build my plan'} onPress={() => router.push((reviewDue ? '/plan/setup?review=1' : '/plan/setup') as never)} />
            </View>
          ) : null}

          {repeating.length ? (
            <Section id="today" icon="check" title="Today" status={`${checkedToday} of ${repeating.length}`} open={shown === 'today'} onToggle={toggle}>
              {repeating.map(g => {
                const p = goalProgress(g, today);
                return (
                  <View key={g.id} style={styles.row}>
                    <Pressable accessibilityRole="button" accessibilityLabel={`${g.title}, open goal`} onPress={() => router.push(`/plan/goal/${g.id}` as never)} style={{ flex: 1 }}>
                      <Text style={styles.rowTitle}>{g.title}</Text>
                      {progressLine(g, today) ? <Text style={styles.meta}>{progressLine(g, today)}</Text> : null}
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={asksAmount(g.target) ? `Log progress for ${g.title}` : p.checkedToday ? `Undo today's check-in for ${g.title}` : `Check in ${g.title} for today`}
                      onPress={() => quickCheckIn(g)}
                      style={[styles.check, p.checkedToday && styles.checkOn]}
                    >
                      {asksAmount(g.target) ? <Icon name="plus" size={20} color={colors.violetDark} /> : <Icon name="check" size={20} color={p.checkedToday ? colors.white : colors.violetDark} />}
                    </Pressable>
                  </View>
                );
              })}
            </Section>
          ) : null}

          <Section id="goals" icon="plan" title="My goals" status={String(oneOff.length + repeating.length)} open={shown === 'goals'} onToggle={toggle}>
            {oneOff.map(g => (
              <Pressable key={g.id} accessibilityRole="button" onPress={() => router.push(`/plan/goal/${g.id}` as never)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
                <GoalIcon goal={g} />
                <View style={{ flex: 1 }}>
                  <Text style={styles.rowTitle}>{g.title}</Text>
                  {g.targetDate ? <Text style={styles.meta}>By {formatDue(g.targetDate)}</Text> : null}
                </View>
                <Icon name="chevron" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
            {repeating.map(g => (
              <Pressable key={g.id} accessibilityRole="button" onPress={() => router.push(`/plan/goal/${g.id}` as never)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
                <GoalIcon goal={g} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>{g.title}</Text>
                <Icon name="chevron" size={18} color={colors.textMuted} />
              </Pressable>
            ))}
            {doneGoals.map(g => (
              <Pressable key={g.id} accessibilityRole="button" onPress={() => router.push(`/plan/goal/${g.id}` as never)} style={[styles.row, styles.rowDone]}>
                <Icon name="check" size={18} color={colors.green} />
                <Text style={[styles.rowTitle, { flex: 1 }]}>{g.title}</Text>
              </Pressable>
            ))}
            <Text accessibilityRole="button" style={styles.add} onPress={() => router.push('/plan/goal/new' as never)}>+ Add a goal</Text>
          </Section>

          {essentials.length && plan.setupComplete ? (
            <Section icon="clipboard" title="Health essentials" status={`${essentialsDone} of ${essentials.length}`} onPress={() => router.push('/plan/essentials' as never)} />
          ) : null}

          {privateSupport.length ? (
            <Section id="private" icon="shield" title="Private support" open={shown === 'private'} onToggle={toggle}>
              {privateSupport.map(m => <SupportCard key={m.topic} message={m} />)}
            </Section>
          ) : null}

          <Section id="support" icon="heart" title="My support" status={plan.support.length ? String(plan.support.filter(s => s !== 'no_one_yet').length) : '–'} open={shown === 'support'} onToggle={toggle}>
            <View style={styles.chips}>
              {plan.support.map(s => <Text key={s} style={styles.chip}>{SUPPORT_OPTIONS[s]}</Text>)}
            </View>
            <Text accessibilityRole="button" style={styles.add} onPress={() => router.push('/plan/setup?review=1' as never)}>Change</Text>
          </Section>

          {plan.providerQuestions.length ? (
            <Section id="questions" icon="help" title="Questions for my provider" status={String(plan.providerQuestions.length)} open={shown === 'questions'} onToggle={toggle}>
              {plan.providerQuestions.map((q, i) => <Text key={q} style={styles.question}>{i + 1}.  {q}</Text>)}
            </Section>
          ) : null}

          {canBookConsultation(settings, dash?.latestResult?.country) ? (
            <Section icon="message" title="Talk it through with a doctor" onPress={() => WebBrowser.openBrowserAsync(settings.consultationUrl)} />
          ) : null}

          {!openGoals.length && plan.setupComplete ? <Body muted>No goals yet.</Body> : null}
          {plan.setupComplete && plan.reviewDate && !reviewDue ? <Text style={styles.small}>Review on {formatDue(plan.reviewDate)}</Text> : null}
          {plan.setupComplete ? <View style={{ marginTop: space.lg }}><Button label={sharing ? 'Making your PDF…' : 'Share my plan (PDF)'} onPress={share} disabled={sharing} /></View> : null}
        </>
      ) : null}
    </Screen>
  );
}

/** A plan section: a header that opens and closes its content, or opens another screen when `onPress` is given. */
function Section({ id, icon, title, status, open, onToggle, onPress, children }: {
  id?: SectionId; icon: IconName; title: string; status?: string; open?: boolean; onToggle?: (id: SectionId) => void; onPress?: () => void; children?: ReactNode;
}) {
  const expandable = !!id && !!onToggle;
  return (
    <View style={[styles.section, open && styles.sectionOpen]}>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={[title, status].filter(Boolean).join(', ')}
        accessibilityState={expandable ? { expanded: !!open } : undefined}
        onPress={expandable ? () => onToggle!(id!) : onPress}
        style={({ pressed }) => [styles.sectionHead, pressed && { opacity: 0.85 }]}
      >
        <View style={styles.sectionIcon}><Icon name={icon} size={20} color={colors.violetDark} /></View>
        <Text style={styles.sectionTitle}>{title}</Text>
        {status ? <Text style={styles.status}>{status}</Text> : null}
        <View style={expandable ? { transform: [{ rotate: open ? '270deg' : '90deg' }] } : undefined}>
          <Icon name="chevron" size={18} color={colors.textMuted} />
        </View>
      </Pressable>
      {open ? <View style={styles.sectionBody}>{children}</View> : null}
    </View>
  );
}

function Tile({ icon, value, label, onPress }: { icon: IconName; value: string; label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={`${label}: ${value.replace('/', ' of ')}`} onPress={onPress} style={({ pressed }) => [styles.tile, pressed && { opacity: 0.85 }]}>
      <View style={styles.tileIcon}><Icon name={icon} size={20} color={colors.violetDark} /></View>
      <Text style={styles.tileValue}>{value}</Text>
      <Text style={styles.tileLabel}>{label}</Text>
    </Pressable>
  );
}

function GoalIcon({ goal }: { goal: PlanGoal }) {
  return <View style={styles.goalIcon}><Icon name={(CATEGORY_ICON as Record<string, IconName>)[goal.category] ?? 'plan'} size={18} color={colors.violetDark} /></View>;
}

const styles = StyleSheet.create({
  board: { flexDirection: 'row', gap: space.sm, marginBottom: space.sm },
  tile: { flex: 1, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, alignItems: 'flex-start' },
  tileIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center', marginBottom: space.xs },
  tileValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.textPrimary },
  tileLabel: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  goalIcon: { width: 34, height: 34, borderRadius: 10, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center' },
  intro: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.xl, gap: space.md },
  introTitle: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 27, color: colors.textPrimary },
  point: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  pointTitle: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  pointIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.roseWash, alignItems: 'center', justifyContent: 'center' },
  link: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark, textAlign: 'center', paddingVertical: space.md },
  small: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, textAlign: 'center', marginTop: space.md },
  statement: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.violetWash, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm },
  statementLabel: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 0.8, textTransform: 'uppercase', color: colors.violetDark },
  statementText: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.textPrimary, marginTop: 4 },
  review: { backgroundColor: colors.roseWash, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm, gap: space.md },
  reviewText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  cardTitle: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.textPrimary },
  section: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, marginTop: space.sm, overflow: 'hidden' },
  sectionOpen: { borderColor: colors.violet },
  sectionHead: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 60 },
  sectionIcon: { width: 36, height: 36, borderRadius: 10, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center' },
  sectionTitle: { flex: 1, fontFamily: fonts.label, fontSize: 16, color: colors.textPrimary },
  status: { fontFamily: fonts.label, fontSize: 13, color: colors.violetDark, backgroundColor: colors.violetWash, borderRadius: 10, paddingHorizontal: 8, paddingVertical: 2, overflow: 'hidden' },
  sectionBody: { paddingHorizontal: space.md, paddingBottom: space.md },
  row: { flexDirection: 'row', gap: space.md, alignItems: 'center', borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: space.sm, minHeight: 56 },
  rowDone: { minHeight: 48 },
  rowTitle: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  check: { width: 44, height: 44, borderRadius: 22, borderWidth: 1.5, borderColor: colors.violet, alignItems: 'center', justifyContent: 'center' },
  checkOn: { backgroundColor: colors.violet },
  add: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark, paddingTop: space.md },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm },
  chip: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.roseDark, backgroundColor: colors.roseWash, borderRadius: 14, paddingHorizontal: space.md, paddingVertical: 6, overflow: 'hidden' },
  question: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textPrimary, borderTopWidth: 1, borderTopColor: colors.border, paddingVertical: space.sm },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert, marginBottom: space.sm },
  note: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, backgroundColor: 'rgba(46,173,130,0.12)', borderRadius: radius.sm, padding: space.md, marginBottom: space.md }
});
