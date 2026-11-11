// One goal. A one-off goal is broken into steps ("Add a step" is the main action); a daily or weekly goal is
// checked in (done, or an amount towards the weekly target) with this week's progress and streak.
// Finishing or deleting the goal is a quieter action further down (owner feedback, 30 Oct 2026).
import { router, useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Alert, Pressable, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text } from '@/design/Text';
import {
  addAction, checkIn, deleteAction, deleteGoal, getPlan, problemMessage, undoCheckIn, updateAction, updateGoal,
  type PlanGoal, type Rhythm, type TargetUnit
} from '@/core/api';
import { Body, Button, Chip, ChipRow, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { Field, SectionLabel } from '@/features/plan/Field';
import { applyGoalReminder, choiceFrom, ReminderPicker, type ReminderChoice } from '@/features/plan/GoalReminder';
import { CATEGORY_LABEL, DUE_OPTIONS, RHYTHM_LABEL, UNIT_LABEL, dateInMonths, formatDue } from '@/features/plan/labels';
import { asksAmount, goalProgress, localDay, progressLine, unitWord, weekStart } from '@/features/plan/progress';
import { deleteGoalReminders, reminderForGoal } from '@/features/reminders/store';

const WEEK = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const UNITS: TargetUnit[] = ['km', 'minutes', 'days', 'times'];

const addDays = (day: string, n: number) => {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n));
};

export default function GoalDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [goal, setGoal] = useState<PlanGoal | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [adding, setAdding] = useState(false);
  const [newStep, setNewStep] = useState('');
  const [stepMonths, setStepMonths] = useState<number | null>(null);
  const [amount, setAmount] = useState('');
  const [editing, setEditing] = useState(false);
  const [edit, setEdit] = useState({ title: '', notes: '', rhythm: 'once' as Rhythm, amount: '', unit: 'times' as TargetUnit });
  const [reminder, setReminder] = useState<ReminderChoice>({ time: null, weekday: 1 });
  const scrollRef = useRef<ScrollViewInstance | null>(null);

  const load = useCallback(() => {
    getPlan()
      .then(p => {
        const g = p.goals.find(x => x.id === id) ?? null;
        setGoal(g);
        if (!g) setError('This goal no longer exists.');
      })
      .catch(e => setError(problemMessage(e)));
  }, [id]);
  useEffect(load, [load]);
  useEffect(() => { reminderForGoal(id).then(r => setReminder(choiceFrom(r))); }, [id]);

  const run = (p: Promise<unknown>) => {
    setError(null);
    return p.then(load).catch(e => setError(`That change could not be saved. ${problemMessage(e)}`));
  };

  if (!goal) {
    return (
      <Screen>
        {error ? <Body>{error}</Body> : <ActivityIndicator color={colors.violet} style={{ marginVertical: space.xl }} />}
      </Screen>
    );
  }

  const today = localDay();
  const repeating = goal.rhythm !== 'once';
  const p = goalProgress(goal, today);
  const wantsAmount = asksAmount(goal.target);
  const open = goal.status === 'open';

  const logToday = () => {
    if (!wantsAmount) return run(p.checkedToday ? undoCheckIn(goal.id, today) : checkIn(goal.id, today));
    const n = Number(amount.replace(',', '.'));
    if (!(n > 0 && n <= 100000)) {
      setError(`Enter how many ${goal.target ? UNIT_LABEL[goal.target.unit] : ''} you did today.`);
      return;
    }
    return run(checkIn(goal.id, today, (p.todayAmount ?? 0) + n).then(() => setAmount('')));
  };

  const startAdding = () => {
    setAdding(true);
    setTimeout(() => scrollRef.current?.scrollToEnd({ animated: true }), 50);
  };
  const saveStep = () => {
    if (!newStep.trim()) {
      setError('Write the step first.');
      return;
    }
    run(addAction(goal.id, { title: newStep.trim(), dueDate: dateInMonths(stepMonths) }).then(() => { setNewStep(''); setStepMonths(null); setAdding(false); }));
  };

  const startEdit = () => {
    setEdit({ title: goal.title, notes: goal.notes ?? '', rhythm: goal.rhythm, amount: goal.target ? String(goal.target.amount) : '', unit: goal.target?.unit ?? 'times' });
    setEditing(true);
  };
  const saveEdit = async () => {
    const n = edit.amount.trim() ? Number(edit.amount.replace(',', '.')) : null;
    if (!edit.title.trim()) return setError('The goal needs a name.');
    if (edit.rhythm === 'weekly' && n !== null && !(n > 0 && n <= 100000)) return setError('Enter a target above 0, or leave it empty.');
    await run(updateGoal(goal.id, {
      title: edit.title.trim(),
      notes: edit.notes.trim() || null,
      rhythm: edit.rhythm,
      target: edit.rhythm === 'weekly' && n ? { amount: n, unit: edit.unit } : null
    }).then(async g => {
      const ok = await applyGoalReminder(g.id, g.title, g.rhythm, reminder).catch(() => false);
      if (!ok) Alert.alert('Saved', 'Notifications are turned off for this app, so there is no reminder.');
      setEditing(false);
    }));
  };

  const finish = () =>
    run(updateGoal(goal.id, { status: open ? 'done' : 'open' }).then(() => (open ? deleteGoalReminders(goal.id) : undefined)));
  const onDelete = () =>
    Alert.alert('Delete this goal?', 'The goal, its steps and check-ins will be permanently removed.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteGoal(goal.id).then(() => deleteGoalReminders(goal.id)).then(() => router.back()).catch(e => setError(problemMessage(e)))
      }
    ]);

  const monday = weekStart(today);
  const checked = new Map(goal.checkins.map(c => [c.day, c]));

  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        <>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          {!open ? null : repeating ? (
            wantsAmount ? (
              <View style={styles.logRow}>
                <View style={{ flex: 1 }}>
                  <Field label={`Add today's ${goal.target ? UNIT_LABEL[goal.target.unit] : ''}`} value={amount} onChangeText={setAmount} placeholder="e.g. 3" keyboardType="decimal-pad" maxLength={6} />
                </View>
                <View style={{ flex: 1, justifyContent: 'flex-end', paddingBottom: space.md }}><Button label="Check in" onPress={logToday} /></View>
              </View>
            ) : (
              <Button label={p.checkedToday ? 'Done today ✓  (tap to undo)' : 'Check in for today'} variant={p.checkedToday ? 'secondary' : 'primary'} onPress={logToday} />
            )
          ) : adding ? (
            <Button label="Save step" onPress={saveStep} />
          ) : (
            <Button label="Add a step" onPress={startAdding} />
          )}
        </>
      }
    >
      <Eyebrow>{`${CATEGORY_LABEL[goal.category]} · ${RHYTHM_LABEL[goal.rhythm]}${goal.targetDate ? ` · by ${formatDue(goal.targetDate)}` : ''}`}</Eyebrow>
      <Title>{goal.title}{open ? '' : ' ✓'}</Title>
      {goal.notes ? <Body>{goal.notes}</Body> : null}

      {repeating ? (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>{progressLine(goal, today)}</Text>
          {p.weekShare !== null ? (
            <View style={styles.track} accessible accessibilityRole="progressbar" accessibilityValue={{ min: 0, max: 100, now: Math.round(p.weekShare * 100) }}>
              <View style={[styles.fill, { width: `${Math.max(3, p.weekShare * 100)}%` }]} />
            </View>
          ) : null}
          {p.todayAmount ? <Text style={styles.meta}>Today: {p.todayAmount} {goal.target ? unitWord(goal.target.unit, p.todayAmount) : ''}</Text> : null}
          <View style={styles.week} accessibilityLabel="This week">
            {WEEK.map((d, i) => {
              const day = addDays(monday, i);
              const c = checked.get(day);
              return (
                <View key={d} style={styles.dayCol}>
                  <View style={[styles.dayDot, c && styles.dayDone, day === today && styles.dayToday]} accessible accessibilityLabel={`${d}: ${c ? 'checked in' : 'no check-in'}`}>
                    {c ? <Text style={styles.dayTick}>✓</Text> : null}
                  </View>
                  <Text style={styles.dayName}>{d}</Text>
                </View>
              );
            })}
          </View>
        </View>
      ) : null}

      <Text style={styles.h} accessibilityRole="header">Steps</Text>
      {goal.actions.length === 0 && !adding ? <Body muted>Break this goal into small steps you can tick off.</Body> : null}
      {goal.actions.map(a => (
        <View key={a.id} style={styles.step}>
          <Pressable
            accessibilityRole="checkbox"
            accessibilityState={{ checked: a.done }}
            accessibilityLabel={`${a.title}${a.dueDate ? `, due ${formatDue(a.dueDate)}` : ''}`}
            onPress={() => run(updateAction(a.id, { done: !a.done }))}
            style={styles.stepMain}
          >
            <View style={[styles.box, a.done && styles.boxOn]}>{a.done ? <Text style={styles.tick}>✓</Text> : null}</View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.stepTitle, a.done && styles.doneText]}>{a.title}</Text>
              {a.dueDate ? <Text style={styles.meta}>Due {formatDue(a.dueDate)}</Text> : null}
            </View>
          </Pressable>
          <Text accessibilityRole="button" accessibilityLabel={`Remove step ${a.title}`} style={styles.remove} onPress={() => run(deleteAction(a.id))}>
            Remove
          </Text>
        </View>
      ))}
      {repeating && open && !adding ? <Text accessibilityRole="button" style={styles.link} onPress={startAdding}>Add a step</Text> : null}
      {adding ? (
        <>
          <Field label="New step" value={newStep} onChangeText={setNewStep} placeholder="e.g. Call the clinic" maxLength={120} autoFocus />
          <SectionLabel>Due</SectionLabel>
          <ChipRow label="Step due date">
            {DUE_OPTIONS.map(o => <Chip key={o.label} label={o.label} selected={stepMonths === o.months} onPress={() => setStepMonths(o.months)} />)}
          </ChipRow>
          {repeating ? <Button label="Save step" variant="secondary" onPress={saveStep} /> : null}
        </>
      ) : null}

      {editing ? (
        <View style={styles.card}>
          <Field label="Goal" value={edit.title} onChangeText={t => setEdit(e => ({ ...e, title: t }))} maxLength={120} />
          <Field label="Notes (optional)" value={edit.notes} onChangeText={t => setEdit(e => ({ ...e, notes: t }))} multiline maxLength={1000} />
          <SectionLabel>How often</SectionLabel>
          <ChipRow label="How often">
            {(Object.keys(RHYTHM_LABEL) as Rhythm[]).map(r => <Chip key={r} label={RHYTHM_LABEL[r]} selected={edit.rhythm === r} onPress={() => setEdit(e => ({ ...e, rhythm: r }))} />)}
          </ChipRow>
          {edit.rhythm === 'weekly' ? (
            <>
              <Field label="Weekly target (optional)" value={edit.amount} onChangeText={t => setEdit(e => ({ ...e, amount: t }))} keyboardType="decimal-pad" maxLength={6} />
              <ChipRow label="Target unit">
                {UNITS.map(u => <Chip key={u} label={UNIT_LABEL[u]} selected={edit.unit === u} onPress={() => setEdit(e => ({ ...e, unit: u }))} />)}
              </ChipRow>
            </>
          ) : null}
          <ReminderPicker rhythm={edit.rhythm} value={reminder} onChange={setReminder} />
          <View style={styles.editButtons}>
            <View style={{ flex: 1 }}><Button label="Cancel" variant="secondary" onPress={() => setEditing(false)} /></View>
            <View style={{ flex: 1 }}><Button label="Save changes" onPress={saveEdit} /></View>
          </View>
        </View>
      ) : null}

      <View style={styles.quiet}>
        {!editing ? <Text accessibilityRole="button" style={styles.link} onPress={startEdit}>Edit goal{repeating ? ', target or reminder' : ''}</Text> : null}
        <Text accessibilityRole="button" style={styles.link} onPress={finish}>{open ? 'Mark goal as finished' : 'Reopen goal'}</Text>
        <Text accessibilityRole="button" style={[styles.link, { color: colors.alert }]} onPress={onDelete}>Delete goal</Text>
      </View>
    </Screen>
  );
}

const styles = StyleSheet.create({
  h: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary, marginTop: space.xl, marginBottom: space.sm },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginTop: space.md },
  cardTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary, marginBottom: space.sm },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.violetWash, overflow: 'hidden', marginBottom: space.sm },
  fill: { height: 8, borderRadius: 4, backgroundColor: colors.violet },
  week: { flexDirection: 'row', justifyContent: 'space-between', marginTop: space.sm },
  dayCol: { alignItems: 'center', gap: 4 },
  dayDot: { width: 30, height: 30, borderRadius: 15, borderWidth: 1.5, borderColor: colors.border, alignItems: 'center', justifyContent: 'center' },
  dayDone: { backgroundColor: colors.violet, borderColor: colors.violet },
  dayToday: { borderColor: colors.violetDark, borderWidth: 2 },
  dayTick: { color: colors.white, fontFamily: fonts.heading, fontSize: 13 },
  dayName: { fontFamily: fonts.body, fontSize: 11, color: colors.textSecondary },
  step: { flexDirection: 'row', alignItems: 'center', backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, paddingRight: space.md, marginBottom: space.sm },
  stepMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.md, minHeight: 56 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#B7ABC4', alignItems: 'center', justifyContent: 'center' },
  boxOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  tick: { color: colors.white, fontFamily: fonts.heading, fontSize: 14 },
  stepTitle: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  doneText: { textDecorationLine: 'line-through', color: colors.textSecondary },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  remove: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.alert, paddingVertical: 12, paddingLeft: space.sm },
  link: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.violetDark, paddingVertical: 12 },
  quiet: { marginTop: space.xl, borderTopWidth: 1, borderTopColor: colors.border, paddingTop: space.sm },
  editButtons: { flexDirection: 'row', gap: space.sm, marginTop: space.sm },
  logRow: { flexDirection: 'row', gap: space.sm },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert }
});
