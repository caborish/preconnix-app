// Shows one server result. Used for a new result and for a saved one opened from history.
import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import type { AssessmentResult } from '@/core/api';
import { Body, Eyebrow, Title } from '@/design/components';
import { ScoreRing } from '@/design/ScoreRing';
import { colors, fonts, radius, space } from '@/design/tokens';
import { BAND_STYLE } from './bands';
import { DISCLAIMER, LEGACY_BAND_TEXT, SAFETY_TEXT, levelWord } from './content';
import { SupportCard } from '@/features/plan/SupportCard';
import { router } from 'expo-router';


const levelColor = (pct: number) => (pct >= 75 ? colors.good : pct >= 50 ? colors.violet : colors.alert);

export const formatDate = (iso: string) =>
  new Date(iso).toLocaleDateString(undefined, { day: 'numeric', month: 'long', year: 'numeric' });

export function ResultView({ result }: { result: AssessmentResult }) {
  const band = BAND_STYLE[result.overall.band];
  return (
    <>
      {result.safetyFlags.length ? (
        <View style={styles.safety} accessibilityRole="alert">
          <Text style={styles.safetyTitle}>Your safety matters</Text>
          <Text style={styles.safetyText}>{SAFETY_TEXT}</Text>
        </View>
      ) : null}

      <Eyebrow>{formatDate(result.computedAt)}</Eyebrow>
      <Title>Reproductive Health Score</Title>
      <ScoreRing score={result.overall.score} />

      <View style={[styles.band, { backgroundColor: band.bg }]}>
        <Text style={[styles.bandTitle, { color: band.fg }]}>
          {result.overall.bandLabel} ({result.overall.score}/100)
        </Text>
        <Text style={styles.bandText}>{LEGACY_BAND_TEXT[result.overall.band]}</Text>
      </View>

      {result.notes?.length ? (
        <>
          <Text style={styles.h3} accessibilityRole="header">From your answers</Text>
          {result.notes.map(n => <Text key={n} style={styles.bandText}>{n}</Text>)}
          {result.bmi ? <Text accessibilityRole="link" style={styles.edit} onPress={() => router.push('/settings/health' as never)}>Edit my height and weight</Text> : null}
        </>
      ) : null}

      {result.support?.map(m => <SupportCard key={m.topic} message={m} />)}

      <Text style={styles.h3} accessibilityRole="header">
        Domain breakdown
      </Text>
      {result.domains.map(d => (
        <View key={d.code} style={styles.domain} accessible accessibilityLabel={`${d.name}: ${d.percent} percent, ${levelWord(d.percent)}`}>
          <View style={styles.domainHead}>
            <Text style={styles.domainName}>{d.name}</Text>
            <Text style={[styles.domainPct, { color: levelColor(d.percent) }]}>{d.percent}%</Text>
          </View>
          <View style={styles.track}>
            <View style={[styles.fill, { width: `${d.percent}%`, backgroundColor: levelColor(d.percent) }]} />
          </View>
          <Text style={styles.level}>{levelWord(d.percent)}</Text>
        </View>
      ))}

      <Body muted>{DISCLAIMER}</Body>
    </>
  );
}

const styles = StyleSheet.create({
  edit: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark, paddingVertical: space.sm },
  safety: { backgroundColor: colors.plum, borderRadius: radius.md, padding: space.lg, marginBottom: space.lg },
  safetyTitle: { fontFamily: fonts.heading, fontSize: 17, color: colors.white, marginBottom: space.xs },
  safetyText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: 'rgba(255,255,255,0.9)' },
  band: { borderRadius: radius.sm, padding: space.lg, marginBottom: space.xl },
  bandTitle: { fontFamily: fonts.heading, fontSize: 16, marginBottom: space.xs },
  bandText: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  h3: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary, marginBottom: space.md },
  domain: { backgroundColor: colors.white, borderRadius: radius.sm, borderWidth: 1, borderColor: colors.border, padding: space.md, marginBottom: space.sm },
  domainHead: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm, gap: space.sm },
  domainName: { flex: 1, fontFamily: fonts.label, fontSize: 14, color: colors.textPrimary },
  domainPct: { fontFamily: fonts.heading, fontSize: 15 },
  track: { height: 8, borderRadius: 4, backgroundColor: colors.violetWash, overflow: 'hidden' },
  fill: { height: '100%', borderRadius: 4 },
  level: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: 6 }

});
