import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { getMe, listSavedAssessments, type AssessmentSummary } from '@/core/api';
import { Body, Button, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { formatDate } from '@/features/results/ResultView';

const BAND_LABEL = { high: 'High', moderate: 'Moderate', low: 'Low' } as const;
const PATHWAY_LABEL = { pregnancy_planning: 'Planning or considering pregnancy', general_wellness: 'General reproductive wellness' } as const;

export default function History() {
  const [items, setItems] = useState<AssessmentSummary[] | null>(null);
  const [saving, setSaving] = useState<boolean | null>(null);
  const [error, setError] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      setError(null);
      Promise.all([listSavedAssessments(), getMe()])
        .then(([list, me]) => {
          setItems(list);
          setSaving(me.consents.history_storage === true);
        })
        .catch(() => setError("Can't reach the PreConnix test server. Check you're on the same Wi-Fi as the Mac."));
    }, [])
  );

  return (
    <Screen footer={<Button label="Take the assessment" onPress={() => router.push('/assess/profile')} />}>
      <Eyebrow>Your results</Eyebrow>
      <Title>History</Title>
      {saving === false ? (
        <View style={styles.notice}>
          <Text style={styles.noticeText}>Saving is off, so new results won't appear here.</Text>
          <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/settings/privacy' as never)}>
            Change in Privacy settings
          </Text>
        </View>
      ) : null}
      {error ? <Body>{error}</Body> : null}
      {!items && !error ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} /> : null}
      {items && items.length === 0 ? <Body>No saved results yet.</Body> : null}
      {items?.map(a => (
        <Pressable
          key={a.id}
          accessibilityRole="button"
          accessibilityLabel={`${formatDate(a.submittedAt ?? a.startedAt)}, score ${a.score}, ${a.band ? BAND_LABEL[a.band] : ''}. Open result`}
          onPress={() => router.push(`/history/${a.id}` as never)}
          style={({ pressed }) => [styles.row, pressed && { opacity: 0.8 }]}
        >
          <View style={styles.scoreBox}>
            <Text style={styles.score}>{a.score}</Text>
          </View>
          <View style={{ flex: 1 }}>
            <Text style={styles.date}>{formatDate(a.submittedAt ?? a.startedAt)}</Text>
            <Text style={styles.band}>{a.band ? BAND_LABEL[a.band] : ''}</Text>
            <Text style={styles.pathway}>{a.pathway ? PATHWAY_LABEL[a.pathway] : ''}</Text>
          </View>
          <Text style={styles.chev}>›</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  notice: { backgroundColor: colors.violetWash, borderRadius: radius.sm, padding: space.md, marginBottom: space.md },
  noticeText: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary },
  link: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.violetDark, textDecorationLine: 'underline', marginTop: 6, paddingVertical: 4 },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, minHeight: 72 },
  scoreBox: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center' },
  score: { fontFamily: fonts.headingBlack, fontSize: 20, color: colors.violetDark },
  date: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  band: { fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  pathway: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted },
  chev: { fontFamily: fonts.heading, fontSize: 24, color: colors.textMuted }
});
