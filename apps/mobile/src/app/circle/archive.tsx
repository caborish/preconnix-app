import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Pressable, StyleSheet } from 'react-native';
import { Text } from '@/design/Text';
import { listCircleQuestions } from '@/core/api';
import { Body, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { formatDate } from '@/features/results/ResultView';

export default function CircleArchive() {
  const [items, setItems] = useState<{ id: string; prompt: string; status: string; publishedAt: string }[] | null>(null);
  useFocusEffect(useCallback(() => { listCircleQuestions().then(r => setItems(r.items)).catch(() => setItems([])); }, []));
  return (
    <Screen>
      <Title>Past weeks</Title>
      {items && items.length === 0 ? <Body>No questions yet.</Body> : null}
      {items?.map(q => (
        <Pressable key={q.id} accessibilityRole="button" onPress={() => router.push(`/circle/${q.id}` as never)} style={styles.row}>
          <Text style={styles.date}>{formatDate(q.publishedAt)}{q.status === 'published' ? ' · this week' : ''}</Text>
          <Text style={styles.prompt}>{q.prompt}</Text>
        </Pressable>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm },
  date: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  prompt: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary, marginTop: 2 }
});
