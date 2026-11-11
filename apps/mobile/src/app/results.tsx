import { router } from 'expo-router';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { Body, Button, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { useDraft } from '@/features/assessment/draft';
import { ShareMenu } from '@/features/report/ShareMenu';
import { AiExplanationCard } from '@/features/results/AiExplanationCard';
import { ResultView } from '@/features/results/ResultView';

export default function Results() {
  const { result, reset } = useDraft();

  if (!result) {
    return (
      <Screen footer={<Button label="Back to start" onPress={() => router.dismissTo('/home')} />}>
        <Title>No results yet</Title>
        <Body>Complete the assessment to see your results.</Body>
      </Screen>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <Screen>
        <View style={[styles.note, result.saved ? styles.saved : styles.unsaved]}>
          <Text style={styles.noteText}>
            {result.saved
              ? 'Saved to your history.'
              : 'Not saved. You chose not to keep results, so this one disappears when you leave this screen. You can change this in Privacy settings.'}
          </Text>
        </View>
        <ResultView result={result} />
        <AiExplanationCard result={result} />
        <View style={styles.end}>
          {result.saved ? <Button label="View my history" variant="secondary" onPress={() => { reset(); router.dismissTo('/home'); router.push('/history' as never); }} /> : null}
          <Button label="Done" onPress={() => { reset(); router.dismissTo('/home'); }} />
        </View>
      </Screen>
      <ShareMenu result={result} />
    </View>
  );
}

const styles = StyleSheet.create({
  end: { marginTop: space.lg, marginBottom: 72, gap: space.sm },
  note: { borderRadius: radius.sm, padding: space.md, marginBottom: space.lg },
  saved: { backgroundColor: 'rgba(46,173,130,0.12)' },
  unsaved: { backgroundColor: colors.violetWash },
  noteText: { fontFamily: fonts.bodyMedium, fontSize: 14, lineHeight: 20, color: colors.textPrimary }
});
