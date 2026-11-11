// After the last question: sends the answers and opens the results straight away (no review page; owner
// feedback, 30 Oct 2026). Whether the result is kept follows the "save my results" privacy choice. If a
// question was missed it opens that card; if the privacy agreement is missing it opens the privacy page, then
// carries on when the person comes back.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useRef, useState } from 'react';
import { ActivityIndicator, Platform, StyleSheet } from 'react-native';
import { Text } from '@/design/Text';
import { ApiError, problemMessage, submitAssessment } from '@/core/api';
import { Body, Button, Screen, Title } from '@/design/components';
import { colors, fonts, space } from '@/design/tokens';
import { definition, useDraft } from '@/features/assessment/draft';
import { openPrivacySetup } from '@/features/onboarding/state';

export default function Finish() {
  const draft = useDraft();
  const [error, setError] = useState<string | null>(null);
  const busy = useRef(false);
  const done = useRef(false);
  // Ask for the privacy agreement once; if the person comes back without it, explain instead of asking again.
  const askedPrivacy = useRef(false);

  const submit = useCallback(async () => {
    if (busy.current || done.current) return;
    const gap = draft.sections.flatMap(s => s.questions.filter(q => !draft.answers[q.id]).map(q => ({ s, q })))[0];
    if (gap) {
      router.replace(`/assess/section/${gap.s.id}?q=${gap.q.id}&from=finish` as never);
      return;
    }
    busy.current = true;
    setError(null);
    try {
      const result = await submitAssessment({
        profile: draft.profile,
        answers: Object.fromEntries(draft.sections.flatMap(s => s.questions.map(q => [q.id, draft.answers[q.id]]))),
        followUps: draft.followUps,
        followUpOther: draft.followUpOther,
        numbers: draft.numbers,
        definitionId: definition.definitionId,
        platform: Platform.OS === 'ios' ? 'ios' : 'android'
      });
      done.current = true;
      draft.setResult(result);
      router.replace('/results' as never);
    } catch (e) {
      if (e instanceof ApiError && (e.code === 'consent_required' || e.code === 'eligibility_required')) {
        if (askedPrivacy.current) setError('To get your results, agree to the Terms and Privacy Policy first.');
        else {
          askedPrivacy.current = true;
          openPrivacySetup('back');
        }
      } else {
        setError(e instanceof ApiError && e.code === 'assessment_incomplete' ? 'Some questions are still unanswered.' : problemMessage(e));
      }
    } finally {
      busy.current = false;
    }
  }, [draft]);

  // Runs on arrival, and again on returning from the privacy page.
  useFocusEffect(useCallback(() => { submit(); }, [submit]));

  return (
    <Screen footer={error ? <Button label="Try again" onPress={() => { askedPrivacy.current = false; submit(); }} /> : undefined}>
      <Title>{error ? 'Your results are not ready' : 'Getting your results'}</Title>
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : (
        <>
          <Body>This takes a moment.</Body>
          <ActivityIndicator color={colors.violet} size="large" style={{ marginTop: space.xl }} />
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.alert } });
