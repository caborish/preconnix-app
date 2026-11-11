// AI-assisted explanation of a saved result (ADR-018), under the result. Shown only when the server offers it.
// Always labelled as AI and never part of the report, PDF or emails. The first use asks for the ai_explanation
// choice, which can be changed later in Privacy settings.
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { ApiError, createExplanation, getExplanation, getMe, saveConsents, type AiExplanation, type AssessmentResult } from '@/core/api';
import { Button } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';

const platform = () => (Platform.OS === 'ios' ? 'ios' : 'android') as 'ios' | 'android';

export function AiExplanationCard({ result }: { result: AssessmentResult }) {
  const [offered, setOffered] = useState(false);
  const [consented, setConsented] = useState(false);
  const [explanation, setExplanation] = useState<AiExplanation | null>(null);
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  useEffect(() => {
    if (!result.saved) return;
    let live = true;
    getMe()
      .then(async me => {
        if (!live || !me.aiExplanation) return;
        setConsented(me.consents.ai_explanation === true);
        setExplanation(await getExplanation(result.assessmentId).catch(() => null));
        if (live) setOffered(true);
      })
      .catch(() => undefined);
    return () => { live = false; };
  }, [result.assessmentId, result.saved]);

  if (!offered) return null;

  const explain = async () => {
    setBusy(true);
    setMessage(null);
    try {
      if (!consented) {
        await saveConsents({ ai_explanation: true }, platform());
        setConsented(true);
      }
      setExplanation(await createExplanation(result.assessmentId));
    } catch (e) {
      setMessage(e instanceof ApiError && e.code === 'too_many_requests'
        ? 'Please try again tomorrow.'
        : 'An explanation is not available right now. Your result above is unchanged.');
    } finally {
      setBusy(false);
    }
  };

  const ask = () => {
    if (consented) return explain();
    Alert.alert('Explain my result with AI?', 'The explanation is written by AI. It is not medical advice, and no doctor has checked it for you. You can turn this off in Privacy settings.', [
      { text: 'Not now', style: 'cancel' },
      { text: 'Explain', onPress: () => { explain(); } }
    ]);
  };

  const nameOf = (code: string) => result.domains.find(d => d.code === code)?.name ?? code;

  return (
    <View style={styles.card} accessibilityLabel="AI-Explainer">
      <Text style={styles.badge}>AI-EXPLAINER</Text>
      {explanation ? (
        <>
          <Text style={styles.title} accessibilityRole="header">Your result, explained</Text>
          <Text style={styles.body}>{explanation.summary}</Text>
          {explanation.areas.map(a => (
            <View key={a.code} style={styles.area}>
              <Text style={styles.areaName}>{nameOf(a.code)}</Text>
              <Text style={styles.body}>{a.explanation}</Text>
              <Text style={styles.askTitle}>Questions to ask your healthcare provider</Text>
              {a.askYourProvider.map(q => <Text key={q} style={styles.ask}>•  {q}</Text>)}
            </View>
          ))}
          <Text style={styles.note}>Written by AI. It is not medical advice and no doctor has checked it for you. Talk it through with your healthcare provider.</Text>
        </>
      ) : (
        <>
          <Text style={styles.title} accessibilityRole="header">Understand your result</Text>
          <Text style={styles.body}>A plain-language explanation of your three focus areas, with questions to ask your healthcare provider.</Text>
          {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
          {busy ? <ActivityIndicator color={colors.violet} style={{ marginTop: space.md }} /> : <View style={{ marginTop: space.md }}><Button label="Explain my result" variant="secondary" onPress={ask} /></View>}
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.violetWash, borderRadius: radius.md, padding: space.lg, marginTop: space.lg },
  badge: { alignSelf: 'flex-start', fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, color: colors.violetDark, backgroundColor: colors.violetWash, borderRadius: radius.sm, paddingHorizontal: space.sm, paddingVertical: 3, marginBottom: space.sm, overflow: 'hidden' },
  title: { fontFamily: fonts.heading, fontSize: 20, lineHeight: 26, color: colors.textPrimary, marginBottom: space.xs },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textSecondary },
  area: { marginTop: space.lg },
  areaName: { fontFamily: fonts.bodyMedium, fontSize: 16, color: colors.textPrimary, marginBottom: space.xs },
  askTitle: { fontFamily: fonts.label, fontSize: 13, color: colors.violetDark, marginTop: space.sm, marginBottom: 2 },
  ask: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textPrimary },
  note: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: space.lg },
  message: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert, marginTop: space.sm }
});
