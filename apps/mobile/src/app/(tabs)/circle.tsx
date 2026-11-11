// Circle (design handoff, mapped to what the server supports): This week (the weekly question with its poll,
// the PreConnix response, approved answers and the answer box) and Past weeks. Posting identity is shown before
// anyone writes. Free posting, topics and live townhalls need a backend and a product decision first.
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { ApiError, getCircleHandle, getCurrentQuestion, listCircleQuestions, problemMessage, type CircleQuestion } from '@/core/api';
import { Body, Screen } from '@/design/components';
import { Icon } from '@/design/Icon';
import { TabHeader } from '@/design/TabHeader';
import { colors, fonts, radius, space } from '@/design/tokens';
import { QuestionView } from '@/features/circle/QuestionView';
import { formatDate } from '@/features/results/ResultView';

type Tab = 'week' | 'past';
type Past = { id: string; prompt: string; status: string; publishedAt: string };

export default function Circle() {
  const [tab, setTab] = useState<Tab>('week');
  const [handle, setHandle] = useState<string | null>(null);
  const [question, setQuestion] = useState<CircleQuestion | null | undefined>(undefined);
  const [past, setPast] = useState<Past[] | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(() => {
    setError(null);
    getCircleHandle().then(h => setHandle(h.handle)).catch(() => undefined);
    getCurrentQuestion()
      .then(setQuestion)
      .catch(e => (e instanceof ApiError && e.code === 'no_question' ? setQuestion(null) : setError(problemMessage(e))));
    listCircleQuestions().then(r => setPast(r.items.filter(q => q.status !== 'published'))).catch(() => setPast([]));
  }, []);
  useFocusEffect(load);

  return (
    <Screen top>
      <TabHeader title="Your Circle" subtitle="A place for questions and shared experience." />
      <View style={styles.tabs} accessibilityRole="tablist">
        {([['week', 'This week'], ['past', 'Past weeks']] as [Tab, string][]).map(([id, label]) => (
          <Pressable key={id} accessibilityRole="tab" accessibilityState={{ selected: tab === id }} onPress={() => setTab(id)} style={[styles.tab, tab === id && styles.tabOn]}>
            <Text style={[styles.tabText, tab === id && styles.tabTextOn]}>{label}</Text>
          </Pressable>
        ))}
      </View>

      {handle ? (
        <View style={styles.identity}>
          <Icon name="account" size={18} color={colors.violetDark} />
          <Text style={styles.identityText}>You post as <Text style={styles.name}>{handle}</Text>. Others see only this name.</Text>
        </View>
      ) : null}
      {error ? <Body>{error}</Body> : null}

      {tab === 'week' ? (
        <>
          {question === undefined && !error ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} /> : null}
          {question === null ? (
            <View style={styles.empty}>
              <Icon name="message" size={28} color={colors.violetDark} />
              <Text style={styles.emptyTitle}>This week's question is coming soon</Text>
              <Text style={styles.meta}>Meanwhile, read what people shared in past weeks.</Text>
            </View>
          ) : null}
          {question ? <QuestionView question={question} onChanged={q => (q ? setQuestion(q) : load())} /> : null}
        </>
      ) : (
        <>
          {past === null ? <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} /> : null}
          {past && past.length === 0 ? <Body muted>Past questions will appear here.</Body> : null}
          {past?.map(q => (
            <Pressable key={q.id} accessibilityRole="button" onPress={() => router.push(`/circle/${q.id}` as never)} style={({ pressed }) => [styles.row, pressed && { opacity: 0.85 }]}>
              <View style={{ flex: 1 }}>
                <Text style={styles.meta}>{formatDate(q.publishedAt)}</Text>
                <Text style={styles.prompt}>{q.prompt}</Text>
              </View>
              <Icon name="chevron" size={20} color={colors.textMuted} />
            </Pressable>
          ))}
        </>
      )}

      <Text accessibilityRole="link" style={styles.link} onPress={() => router.push('/circle/guidelines' as never)}>Community guidelines</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  tabs: { flexDirection: 'row', gap: space.sm, marginBottom: space.lg },
  tab: { minHeight: 44, paddingHorizontal: space.lg, borderRadius: 17, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white, justifyContent: 'center' },
  tabOn: { backgroundColor: colors.violetDark, borderColor: colors.violetDark },
  tabText: { fontFamily: fonts.label, fontSize: 14, color: colors.textPrimary },
  tabTextOn: { color: colors.white },
  identity: { flexDirection: 'row', alignItems: 'center', gap: space.sm, backgroundColor: colors.violetWash, borderRadius: radius.sm, padding: space.md, marginBottom: space.md },
  identityText: { flex: 1, fontFamily: fonts.body, fontSize: 14, color: colors.textSecondary },
  name: { fontFamily: fonts.label, color: colors.violetDark },
  empty: { alignItems: 'center', gap: space.sm, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.xl },
  emptyTitle: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary, textAlign: 'center' },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, minHeight: 64 },
  prompt: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary, marginTop: 2 },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  link: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.violetDark, paddingVertical: 12, marginTop: space.sm }
});
