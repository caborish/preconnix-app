// "Generate my plan" (Dr Gloria, 5 Nov 2026 and Review 3; owner, 9 Nov 2026): a draft from her latest assessment that
// addresses her top risks, for her overall goal, each with the answers behind it. She can change, add to or remove
// from it. Nothing is saved until she accepts it. After a retake it updates the plan she already has.
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/design/Text';
import { createGoal, getPlan, getPlanDraft, problemMessage, updateGoal, updatePlan, type PlanDraft } from '@/core/api';
import { Body, Button, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { dateInMonths, intentionLabel, RHYTHM_LABEL } from '@/features/plan/labels';
import { REVIEW_MONTHS } from '@/features/plan/setup';
import { SupportCard } from '@/features/plan/SupportCard';

type EditGoal = PlanDraft['goals'][number] | { title: string; category: 'other'; rhythm: 'once'; notes: null; reasons: PlanDraft['goals'][number]['reasons'] };
const MAX_TEXT = 120;
const MAX_QUESTION = 200;

export default function GeneratePlan() {
  const [draft, setDraft] = useState<PlanDraft | null>(null);
  const [goals, setGoals] = useState<EditGoal[]>([]);
  const [questions, setQuestions] = useState<string[]>([]);
  const [doing, setDoing] = useState<PlanDraft['alreadyDoing']>([]);
  const [finished, setFinished] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  // A retry after a failed save must not add the same goals twice.
  const saved = useRef(new Set<string>());

  useEffect(() => {
    getPlanDraft()
      .then(d => { setDraft(d); setGoals(d.goals); setQuestions(d.questions); setDoing(d.alreadyDoing); })
      .catch(e => setError(problemMessage(e)));
  }, []);

  const accept = async () => {
    if (!draft) return;
    setSaving(true);
    setError(null);
    try {
      for (const g of goals) {
        const title = g.title.trim();
        if (!title || saved.current.has(title.toLowerCase())) continue;
        await createGoal({ title, category: g.category, rhythm: g.rhythm, notes: g.notes, targetDate: g.rhythm === 'once' ? dateInMonths(REVIEW_MONTHS) : null });
        saved.current.add(title.toLowerCase());
      }
      const plan = await getPlan();
      for (const g of plan.goals) if (g.status === 'open' && finished.includes(g.title)) await updateGoal(g.id, { status: 'done' });
      await updatePlan({
        intention: plan.intention ?? draft.intention,
        setupComplete: true,
        reviewDate: plan.reviewDate ?? dateInMonths(REVIEW_MONTHS),
        essentialsDone: [...new Set([...plan.essentialsDone, ...doing.map(d => d.essential)])],
        essentialsFocus: [...new Set([...draft.essentials, ...doing].map(e => e.essential))],
        ...(draft.assessmentId ? { sourceAssessmentId: draft.assessmentId } : {}),
        providerQuestions: [...new Set([...plan.providerQuestions, ...questions.map(q => q.trim()).filter(Boolean)])].slice(0, 10)
      });
      router.back();
    } catch (e) {
      setError(problemMessage(e));
    } finally {
      setSaving(false);
    }
  };

  const setGoal = (i: number, title: string) => setGoals(gs => gs.map((g, j) => (j === i ? { ...g, title } : g)));
  const setQuestion = (i: number, q: string) => setQuestions(qs => qs.map((x, j) => (j === i ? q : x)));

  return (
    <Screen footer={draft ? <Button label={saving ? 'Saving…' : 'Accept my plan'} onPress={accept} disabled={saving} /> : undefined}>
      <Title>Your draft plan</Title>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      {!draft && !error ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} /> : null}
      {draft ? (
        <>
          <Text style={styles.h} accessibilityRole="header">1. My goal</Text>
          <View style={styles.goalCard}>
            <Text style={styles.goalTitle}>{draft.path === 'pregnancy' ? 'Getting ready for pregnancy' : 'Caring for my reproductive health'}</Text>
            {intentionLabel(draft.intention) ? <Text style={styles.meta}>{intentionLabel(draft.intention)}</Text> : null}
          </View>

          <Text style={styles.h} accessibilityRole="header">{goals.length > 1 ? `2. My top ${goals.length} priorities` : '2. My priorities'}</Text>
          <Text style={styles.lead}>From your answers, most important first. Change anything you like.</Text>
          {goals.map((g, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.titleRow}>
                <Text style={styles.rank}>{i + 1}</Text>
                <TextInput accessibilityLabel={`Goal ${i + 1}`} value={g.title} onChangeText={t => setGoal(i, t)} maxLength={MAX_TEXT} multiline style={[styles.input, { flex: 1 }]} />
              </View>
              {g.reasons.map(r => <Text key={r.question} style={styles.reason}>You answered “{r.answer}”: {r.question}</Text>)}
              {g.notes ? <Text style={styles.meta}>{g.notes}</Text> : null}
              <View style={styles.foot}>
                <Text style={styles.meta}>{RHYTHM_LABEL[g.rhythm]}</Text>
                <Remove label={`Remove goal ${i + 1}`} onPress={() => setGoals(gs => gs.filter((_, j) => j !== i))} />
              </View>
            </View>
          ))}
          <Text accessibilityRole="button" style={styles.add} onPress={() => setGoals(gs => [...gs, { title: '', category: 'other', rhythm: 'once', notes: null, reasons: [] }])}>+ Add my own goal</Text>

          {draft.clearedGoals.length ? (
            <>
              <Text style={styles.h} accessibilityRole="header">Your answers have improved</Text>
              <Text style={styles.lead}>Your latest answers no longer call for these goals. Tap any you have finished.</Text>
              {draft.clearedGoals.map(t => {
                const on = finished.includes(t);
                return (
                  <Pressable key={t} accessibilityRole="checkbox" accessibilityState={{ checked: on }} onPress={() => setFinished(f => (on ? f.filter(x => x !== t) : [...f, t]))} style={[styles.card, styles.foot]}>
                    <Text style={[styles.done, { flex: 1 }]}>{t}</Text>
                    <Text style={styles.remove}>{on ? 'Finished' : 'Mark finished'}</Text>
                  </Pressable>
                );
              })}
            </>
          ) : null}

          <Text style={styles.h} accessibilityRole="header">3. Questions for my doctor</Text>
          {questions.map((q, i) => (
            <View key={i} style={styles.card}>
              <TextInput accessibilityLabel={`Question ${i + 1}`} value={q} onChangeText={t => setQuestion(i, t)} maxLength={MAX_QUESTION} multiline style={styles.input} />
              <View style={styles.foot}>
                <View />
                <Remove label={`Remove question ${i + 1}`} onPress={() => setQuestions(qs => qs.filter((_, j) => j !== i))} />
              </View>
            </View>
          ))}
          <Text accessibilityRole="button" style={styles.add} onPress={() => setQuestions(qs => [...qs, ''])}>+ Add my own question</Text>

          {doing.length ? (
            <>
              <Text style={styles.h} accessibilityRole="header">Already doing</Text>
              {doing.map(d => (
                <View key={d.essential} style={[styles.card, styles.foot]}>
                  <Text style={[styles.done, { flex: 1 }]}>{d.title}</Text>
                  <Remove label={`Remove ${d.title}`} onPress={() => setDoing(ds => ds.filter(x => x.essential !== d.essential))} />
                </View>
              ))}
            </>
          ) : null}

          {draft.essentials.length ? (
            <>
              <Text style={styles.h} accessibilityRole="header">On your checklist</Text>
              {draft.essentials.map(e => <Text key={e.essential} style={styles.check}>{e.title}</Text>)}
            </>
          ) : null}

          {draft.support.length ? (
            <>
              <Text style={styles.h} accessibilityRole="header">Private support</Text>
              {draft.support.map(m => <SupportCard key={m.topic} message={m} />)}
            </>
          ) : null}
        </>
      ) : null}
    </Screen>
  );
}

function Remove({ label, onPress }: { label: string; onPress: () => void }) {
  return (
    <Pressable accessibilityRole="button" accessibilityLabel={label} onPress={onPress} hitSlop={10}>
      <Text style={styles.remove}>Remove</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.textPrimary, marginTop: space.lg, marginBottom: space.sm },
  lead: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary, marginBottom: space.sm },
  goalCard: { backgroundColor: colors.violetWash, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm },
  goalTitle: { fontFamily: fonts.heading, fontSize: 18, lineHeight: 24, color: colors.textPrimary },
  titleRow: { flexDirection: 'row', gap: space.sm, alignItems: 'flex-start' },
  rank: { width: 26, height: 26, borderRadius: 13, overflow: 'hidden', textAlign: 'center', lineHeight: 26, fontFamily: fonts.label, fontSize: 13, color: colors.white, backgroundColor: colors.roseDark },
  reason: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: space.xs },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  input: { fontFamily: fonts.label, fontSize: 15, lineHeight: 21, color: colors.textPrimary, padding: 0 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 4 },
  foot: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', gap: space.md },
  remove: { fontFamily: fonts.label, fontSize: 14, color: colors.roseDark, paddingVertical: 6 },
  done: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  check: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textPrimary, marginBottom: space.xs },
  add: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark, paddingVertical: space.sm },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert, marginBottom: space.sm }
});
