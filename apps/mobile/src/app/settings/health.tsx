// Height, weight, BMI and pregnancies (owner, 9 Nov 2026): she can come back and change them. The next assessment and
// generated plan use the latest numbers; results already saved do not change.
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { getHealthDetails, problemMessage, saveHealthDetails, type HealthDetails } from '@/core/api';
import { Body, Button, Screen, Title } from '@/design/components';
import { Text } from '@/design/Text';
import { colors, fonts, radius, space } from '@/design/tokens';
import { definition } from '@/features/assessment/draft';
import { MeasureFields } from '@/features/assessment/MeasureFields';
import { Field } from '@/features/plan/Field';

type Key = 'gravida' | 'parity';
const counts = definition.sections.flatMap(s => s.questions).find(q => q.pregnancyCounts)!.pregnancyCounts!;
const text = (n: number | null) => (n === null ? '' : String(n));
const num = (t: string, parse: (x: string) => number) => { const n = parse(t); return t.trim() === '' || !Number.isFinite(n) ? null : n; };

export default function HealthDetailsScreen() {
  const [data, setData] = useState<HealthDetails | null>(null);
  const [form, setForm] = useState<Record<Key, string>>({ gravida: '', parity: '' });
  const [body, setBody] = useState<{ h: number | null; w: number | null }>({ h: null, w: null });
  const [message, setMessage] = useState<{ text: string; bad: boolean } | null>(null);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    getHealthDetails().then(d => {
      setData(d);
      setBody({ h: d.heightCm, w: d.weightKg });
      setForm({ gravida: text(d.gravida), parity: text(d.parity) });
    }).catch(e => setMessage({ text: problemMessage(e), bad: true }));
  }, []);

  const set = (k: Key) => (t: string) => { setForm(f => ({ ...f, [k]: t })); setMessage(null); };
  const save = async () => {
    setSaving(true);
    try {
      const d = await saveHealthDetails({
        heightCm: body.h, weightKg: body.w,
        gravida: num(form.gravida, x => parseInt(x, 10)), parity: num(form.parity, x => parseInt(x, 10))
      });
      setData(d);
      setMessage({ text: 'Saved.', bad: false });
    } catch {
      setMessage({ text: 'Check the numbers: enter both height and weight, and no more births than pregnancies.', bad: true });
    } finally {
      setSaving(false);
    }
  };

  const m = (id: string) => definition.measurements!.find(x => x.id === id)!;
  return (
    <Screen footer={data ? <Button label={saving ? 'Saving…' : 'Save'} onPress={save} disabled={saving} /> : undefined}>
      <Title>Your health details</Title>
      {!data && !message ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} /> : null}
      {message ? <Text style={[styles.message, message.bad && styles.bad]} accessibilityLiveRegion="polite">{message.text}</Text> : null}
      {data ? (
        <>
          <Body>Your next assessment and plan will use these. Saved results stay as they are.</Body>
          {data.bmi ? <View style={styles.bmi}><Text style={styles.bmiValue}>BMI {data.bmi.value.toFixed(1)}</Text><Text style={styles.bmiLabel}>{data.bmi.label}</Text></View> : null}
          <MeasureFields
            heightCm={body.h}
            weightKg={body.w}
            ranges={{ heightCm: m('heightCm'), weightKg: m('weightKg') }}
            onChange={(h, w) => { setBody({ h, w }); setMessage(null); }}
          />
          <Field label={counts.gravidaLabel} keyboardType="number-pad" maxLength={2} value={form.gravida} onChangeText={set('gravida')} />
          <Field label={counts.parityLabel} keyboardType="number-pad" maxLength={2} value={form.parity} onChangeText={set('parity')} />
        </>
      ) : null}
    </Screen>
  );
}

const styles = StyleSheet.create({
  message: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary, marginBottom: space.sm },
  bad: { color: colors.alert },
  bmi: { backgroundColor: colors.violetWash, borderRadius: radius.md, padding: space.lg, marginVertical: space.md },
  bmiValue: { fontFamily: fonts.heading, fontSize: 22, color: colors.textPrimary },
  bmiLabel: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary }
});
