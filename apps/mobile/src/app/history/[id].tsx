import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, Alert, View } from 'react-native';
import { deleteAssessment, getResult, type AssessmentResult } from '@/core/api';
import { Body, Button, Screen } from '@/design/components';
import { colors, space } from '@/design/tokens';
import { ShareMenu } from '@/features/report/ShareMenu';
import { AiExplanationCard } from '@/features/results/AiExplanationCard';
import { ResultView } from '@/features/results/ResultView';

export default function SavedResult() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [result, setResult] = useState<AssessmentResult | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    getResult(id).then(setResult).catch(() => setError('This result could not be loaded.'));
  }, [id]);

  const onDelete = () =>
    Alert.alert('Delete this result?', 'It will be permanently removed from your history.', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: () => deleteAssessment(id).then(() => router.back()).catch(() => setError('This result could not be deleted.'))
      }
    ]);

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {error ? <Body>{error}</Body> : null}
        {!result && !error ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.xl }} /> : null}
        {result ? <ResultView result={result} /> : null}
        {result ? <AiExplanationCard result={result} /> : null}
        {result ? (
          <View style={{ marginTop: space.lg, marginBottom: 72 }}>
            <Button label="Delete this result" variant="secondary" onPress={onDelete} />
          </View>
        ) : null}
      </Screen>
      {result ? <ShareMenu result={result} /> : null}
    </View>
  );
}
