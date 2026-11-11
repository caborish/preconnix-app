// Height and weight in the units she prefers, with her BMI worked out as she types. Always editable.
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Chip, ChipRow } from '@/design/components';
import { Text } from '@/design/Text';
import { colors, fonts, radius, space } from '@/design/tokens';
import { Field } from '@/features/plan/Field';
import { bmiValue, cmFromFeet, feetFromCm, kgFromPounds, poundsFromKg, type HeightUnit, type WeightUnit } from './units';

const parse = (t: string) => { const n = parseFloat(t); return t.trim() !== '' && Number.isFinite(n) ? n : null; };

export function MeasureFields({ heightCm, weightKg, onChange, ranges }: {
  heightCm: number | null;
  weightKg: number | null;
  onChange: (heightCm: number | null, weightKg: number | null) => void;
  ranges: { heightCm: { min: number; max: number }; weightKg: { min: number; max: number } };
}) {
  const [hUnit, setHUnit] = useState<HeightUnit>('cm');
  const [wUnit, setWUnit] = useState<WeightUnit>('kg');
  const [text, setText] = useState({ cm: '', ft: '', inch: '', kg: '', lb: '' });
  // Fills the boxes from saved numbers once, and when a unit is switched; never while she is typing.
  const typing = useRef(false);

  const fromSaved = (h: number | null, w: number | null) => {
    const f = h === null ? null : feetFromCm(h);
    return { cm: h === null ? '' : String(h), ft: f ? String(f.feet) : '', inch: f ? String(f.inches) : '', kg: w === null ? '' : String(w), lb: w === null ? '' : String(poundsFromKg(w)) };
  };
  useEffect(() => { if (!typing.current) setText(fromSaved(heightCm, weightKg)); }, [heightCm, weightKg]);

  const update = (next: typeof text, h: HeightUnit = hUnit, w: WeightUnit = wUnit) => {
    typing.current = true;
    setText(next);
    const feet = parse(next.ft);
    const cm = h === 'cm' ? parse(next.cm) : feet === null ? null : cmFromFeet(feet, parse(next.inch) ?? 0);
    const lb = parse(next.lb);
    onChange(cm, w === 'kg' ? parse(next.kg) : lb === null ? null : kgFromPounds(lb));
  };
  const switchHeight = (u: HeightUnit) => { typing.current = false; setHUnit(u); setText(fromSaved(heightCm, weightKg)); };
  const switchWeight = (u: WeightUnit) => { typing.current = false; setWUnit(u); setText(fromSaved(heightCm, weightKg)); };

  const inRange = (n: number | null, r: { min: number; max: number }) => n !== null && n >= r.min && n <= r.max;
  const bmi = inRange(heightCm, ranges.heightCm) && inRange(weightKg, ranges.weightKg) ? bmiValue(heightCm!, weightKg!) : null;

  return (
    <View>
      <Text style={styles.label}>Your height</Text>
      <ChipRow label="Height unit">
        <Chip label="cm" selected={hUnit === 'cm'} onPress={() => switchHeight('cm')} />
        <Chip label="feet and inches" selected={hUnit === 'ft'} onPress={() => switchHeight('ft')} />
      </ChipRow>
      {hUnit === 'cm' ? (
        <Field label="Centimetres" placeholder="e.g. 160" keyboardType="numeric" maxLength={5} value={text.cm} onChangeText={t => update({ ...text, cm: t })} />
      ) : (
        <View style={styles.pair}>
          <View style={styles.half}><Field label="Feet" placeholder="e.g. 5" keyboardType="number-pad" maxLength={1} value={text.ft} onChangeText={t => update({ ...text, ft: t })} /></View>
          <View style={styles.half}><Field label="Inches" placeholder="e.g. 4" keyboardType="numeric" maxLength={4} value={text.inch} onChangeText={t => update({ ...text, inch: t })} /></View>
        </View>
      )}
      <Text style={styles.label}>Your weight</Text>
      <ChipRow label="Weight unit">
        <Chip label="kg" selected={wUnit === 'kg'} onPress={() => switchWeight('kg')} />
        <Chip label="pounds" selected={wUnit === 'lb'} onPress={() => switchWeight('lb')} />
      </ChipRow>
      {wUnit === 'kg' ? (
        <Field label="Kilograms" placeholder="e.g. 65" keyboardType="numeric" maxLength={5} value={text.kg} onChangeText={t => update({ ...text, kg: t })} />
      ) : (
        <Field label="Pounds" placeholder="e.g. 143" keyboardType="numeric" maxLength={5} value={text.lb} onChangeText={t => update({ ...text, lb: t })} />
      )}
      {bmi !== null ? <View style={styles.bmi} accessibilityLiveRegion="polite"><Text style={styles.bmiText}>Your BMI: {bmi.toFixed(1)}</Text></View> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary, marginBottom: space.sm, marginTop: space.sm },
  pair: { flexDirection: 'row', gap: space.sm },
  half: { flex: 1 },
  bmi: { backgroundColor: colors.violetWash, borderRadius: radius.md, padding: space.md, marginBottom: space.md },
  bmiText: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary }
});
