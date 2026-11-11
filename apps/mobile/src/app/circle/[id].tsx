import { useLocalSearchParams } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator } from 'react-native';
import { getCircleQuestion, type CircleQuestion } from '@/core/api';
import { Body, Screen } from '@/design/components';
import { colors, space } from '@/design/tokens';
import { QuestionView } from '@/features/circle/QuestionView';

export default function CircleQuestionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [q, setQ] = useState<CircleQuestion | null>(null);
  const [error, setError] = useState(false);
  const load = useCallback(() => { getCircleQuestion(id).then(setQ).catch(() => setError(true)); }, [id]);
  useEffect(load, [load]);
  return (
    <Screen>
      {error ? <Body>This question could not be loaded.</Body> : null}
      {!q && !error ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} /> : null}
      {q ? <QuestionView question={q} onChanged={next => (next ? setQ(next) : load())} /> : null}
    </Screen>
  );
}
