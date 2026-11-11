// New goal: once, every day, or every week with an optional target the person sets, plus a check-in reminder.
// `?domain=…&s=…` starts from a suggested goal for a focus area (packages/content goals.ts). Without one, ideas
// from the latest result's focus areas are offered at the top (the Plan page no longer lists them, 1 Nov 2026).
// Saving returns to the plan's home (owner feedback, 30 Oct 2026).
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Alert, StyleSheet } from 'react-native';
import { Text } from '@/design/Text';
import { suggestionsFor, type GoalSuggestion, type TargetUnit } from '@preconnix/content';
import { createGoal, getDashboard, getPlan, problemMessage, type GoalCategory, type Rhythm } from '@/core/api';
import { Button, Chip, ChipRow, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts } from '@/design/tokens';
import { Field, SectionLabel } from '@/features/plan/Field';
import { applyGoalReminder, defaultReminder, ReminderPicker, type ReminderChoice } from '@/features/plan/GoalReminder';
import { CATEGORY_LABEL, DUE_OPTIONS, RHYTHM_LABEL, UNIT_LABEL, dateInMonths } from '@/features/plan/labels';
import { goalChoices } from '@/features/plan/setup';

const ALL_UNITS: TargetUnit[] = ['km', 'minutes', 'days', 'times'];

export default function NewGoal() {
  const params = useLocalSearchParams<{ domain?: string; s?: string }>();
  const [domain, setDomain] = useState(params.domain);
  const [suggestion, setSuggestion] = useState<GoalSuggestion | undefined>(params.domain ? suggestionsFor(params.domain)[Number(params.s ?? 0)] : undefined);
  const [ideas, setIdeas] = useState<{ domain: string; s: GoalSuggestion }[]>([]);
  useEffect(() => {
    if (params.domain) return;
    Promise.all([getDashboard(), getPlan()]).then(([d, p]) => {
      const taken = p.goals.filter(g => g.status === 'open').map(g => g.title);
      const out: { domain: string; s: GoalSuggestion }[] = [];
      for (const f of d.latestResult?.focus ?? []) {
        for (const x of goalChoices(f.code, [...taken, ...out.map(o => o.s.title)])) out.push({ domain: f.code, s: x });
      }
      setIdeas(out.slice(0, 6));
    }).catch(() => undefined);
  }, [params.domain]);
  const pickIdea = (i: { domain: string; s: GoalSuggestion }) => {
    setDomain(i.domain);
    setSuggestion(i.s);
    setCategory(i.s.category);
    setTitle(i.s.title);
    setRhythm(i.s.rhythm);
    setUnit(i.s.units?.[0] ?? 'times');
  };

  const [category, setCategory] = useState<GoalCategory | null>(suggestion?.category ?? null);
  const [title, setTitle] = useState(suggestion?.title ?? '');
  const [rhythm, setRhythm] = useState<Rhythm>(suggestion?.rhythm ?? 'once');
  const [amount, setAmount] = useState('');
  const [unit, setUnit] = useState<TargetUnit>(suggestion?.units?.[0] ?? 'times');
  const [months, setMonths] = useState<number | null>(null);
  const [reminder, setReminder] = useState<ReminderChoice>(defaultReminder);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const units = suggestion?.units ?? ALL_UNITS;
  const targetAmount = amount.trim() ? Number(amount.replace(',', '.')) : null;
  const badAmount = rhythm === 'weekly' && targetAmount !== null && !(targetAmount > 0 && targetAmount <= 100000);
  const missing = [category === null && 'choose an area', !title.trim() && 'write your goal', badAmount && 'enter a target above 0'].filter(Boolean) as string[];

  const onSave = async () => {
    if (!category || missing.length) {
      setError(`To save, ${missing.join(' and ')}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      const g = await createGoal({
        category,
        title: title.trim(),
        rhythm,
        target: rhythm === 'weekly' && targetAmount ? { amount: targetAmount, unit } : null,
        targetDate: rhythm === 'once' ? dateInMonths(months) : null,
        ...(domain ? { sourceDomain: domain } : {})
      });
      const reminded = await applyGoalReminder(g.id, g.title, rhythm, reminder).catch(() => false);
      if (!reminded) Alert.alert('Goal saved', 'Notifications are turned off for this app, so there is no reminder. You can turn them on in your phone Settings.');
      router.back();
    } catch (e) {
      setError(`Your goal could not be saved. ${problemMessage(e)}`);
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button label={busy ? 'Saving…' : 'Save goal'} onPress={onSave} disabled={busy} />
        </>
      }
    >
      <Eyebrow>Your plan</Eyebrow>
      <Title>{params.domain ? 'Add to my plan' : 'New goal'}</Title>
      {ideas.length ? (
        <>
          <SectionLabel>Ideas from your result</SectionLabel>
          <ChipRow label="Ideas from your result">
            {ideas.map(i => <Chip key={i.s.title} label={i.s.title} selected={title === i.s.title} onPress={() => pickIdea(i)} />)}
          </ChipRow>
        </>
      ) : null}
      <Field label="Goal" value={title} onChangeText={setTitle} placeholder="e.g. Book a check-up" maxLength={120} />

      <SectionLabel>How often</SectionLabel>
      <ChipRow label="How often">
        {(Object.keys(RHYTHM_LABEL) as Rhythm[]).map(r => <Chip key={r} label={RHYTHM_LABEL[r]} selected={rhythm === r} onPress={() => setRhythm(r)} />)}
      </ChipRow>

      {rhythm === 'weekly' ? (
        <>
          <Field label="Weekly target (optional)" value={amount} onChangeText={setAmount} placeholder="e.g. 10" keyboardType="decimal-pad" maxLength={6} />
          <ChipRow label="Target unit">
            {units.map(u => <Chip key={u} label={UNIT_LABEL[u]} selected={unit === u} onPress={() => setUnit(u)} />)}
          </ChipRow>
        </>
      ) : null}

      {rhythm === 'once' ? (
        <>
          <SectionLabel>Aim to finish within</SectionLabel>
          <ChipRow label="Target date">
            {DUE_OPTIONS.map(o => <Chip key={o.label} label={o.label} selected={months === o.months} onPress={() => setMonths(o.months)} />)}
          </ChipRow>
        </>
      ) : (
        <ReminderPicker rhythm={rhythm} value={reminder} onChange={setReminder} />
      )}

      {!suggestion ? (
        <>
          <SectionLabel>Area</SectionLabel>
          <ChipRow label="Goal area">
            {(Object.keys(CATEGORY_LABEL) as GoalCategory[]).map(c => (
              <Chip key={c} label={CATEGORY_LABEL[c]} selected={category === c} onPress={() => setCategory(c)} />
            ))}
          </ChipRow>
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert } });
