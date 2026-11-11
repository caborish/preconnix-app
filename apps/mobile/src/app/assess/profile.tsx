import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { AccessibilityInfo, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { getHealthDetails } from '@/core/api';
import { Text } from '@/design/Text';
import { Body, Button, Chip, ChipRow, ChoiceGroup, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts } from '@/design/tokens';
import { definition, nextRoute, useDraft } from '@/features/assessment/draft';
import { MeasureFields } from '@/features/assessment/MeasureFields';

export default function Profile() {
  const draft = useDraft();
  const [showErrors, setShowErrors] = useState(false);
  const scrollRef = useRef<ScrollViewInstance | null>(null);
  const positions = useRef<Record<string, number>>({});
  // Nigeria only (owner, 5 Nov 2026): the country is set for her and the question is not shown.
  useEffect(() => { if (draft.profile.country !== 'NG') draft.setProfile('country', 'NG'); }, [draft]);
  // Start from the numbers saved in Account, which she can change here.
  const filled = useRef(false);
  useEffect(() => {
    if (filled.current) return;
    filled.current = true;
    getHealthDetails().then(d => {
      for (const id of ['heightCm', 'weightKg', 'gravida', 'parity'] as const) { const n = d[id]; if (n !== null && draft.numbers[id] === undefined) draft.setNumber(id, n); }
    }).catch(() => undefined);
  }, [draft]);
  const fields = definition.profile.filter(f => f.id !== 'country');
  const missing = fields.filter(f => draft.profile[f.id] === undefined);

  // Height and weight are optional: both within range, or "I don't know" (Dr Gloria, Review 4).
  const measurements = definition.measurements ?? [];
  const measuresOk = draft.noMeasurements || measurements.every(m => draft.numbers[m.id] >= m.min && draft.numbers[m.id] <= m.max);

  const onContinue = () => {
    if (missing.length || !measuresOk) {
      setShowErrors(true);
      // Show the first missed question rather than leaving the person to look for it.
      if (missing.length) scrollRef.current?.scrollTo({ y: Math.max(0, (positions.current[missing[0].id] ?? 0) - 16), animated: true });
      AccessibilityInfo.announceForAccessibility(`Please answer: ${missing.map(f => f.label).join(', ') || 'height and weight'}`);
      return;
    }
    router.push(nextRoute(draft.sections) as never);
  };

  return (
    <Screen
      scrollRef={scrollRef}
      footer={
        <>
          {showErrors && (missing.length || !measuresOk) ? (
            <Text style={styles.error} accessibilityLiveRegion="polite">
              {missing.length > 1 ? `${missing.length} questions still need an answer.` : missing.length ? 'One question still needs an answer.' : 'Enter your height and weight, or tap I don\u2019t know.'}
            </Text>
          ) : null}
          <Button label="Continue" onPress={onContinue} />
        </>
      }
    >
      <Eyebrow>Your profile</Eyebrow>
      <Title>About you</Title>
      <Body>This helps personalise your assessment.</Body>
      {fields.map(field => {
        const selected = field.options.find(o => o.value === draft.profile[field.id])?.id;
        return (
          <View key={field.id} onLayout={e => { positions.current[field.id] = e.nativeEvent.layout.y; }}>
          <ChoiceGroup
            label={field.label}
            choices={field.options}
            selected={selected}
            error={showErrors && !selected}
            onSelect={optionId => {
              const value = field.options.find(o => o.id === optionId)?.value;
              if (value) draft.setProfile(field.id, value);
            }}
          />
          </View>
        );
      })}
      {measurements.length && !draft.noMeasurements ? (
        <MeasureFields
          heightCm={draft.numbers.heightCm ?? null}
          weightKg={draft.numbers.weightKg ?? null}
          ranges={{ heightCm: measurements.find(m => m.id === 'heightCm')!, weightKg: measurements.find(m => m.id === 'weightKg')! }}
          onChange={(h, w) => { draft.setNumber('heightCm', h); draft.setNumber('weightKg', w); }}
        />
      ) : null}
      {measurements.length ? (
        <ChipRow label="Height and weight">
          <Chip label="I don't know" selected={draft.noMeasurements} onPress={() => {
            const on = !draft.noMeasurements;
            if (on) measurements.forEach(m => draft.setNumber(m.id, null));
            draft.setNoMeasurements(on);
          }} />
        </ChipRow>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert } });
