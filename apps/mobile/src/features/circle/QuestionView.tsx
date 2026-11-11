// One Circle question: prompt, poll, the PreConnix response, approved answers and the answer box.
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, TextInput, View } from 'react-native';
import { Text } from '@/design/Text';
import { ApiError, blockHandle, postAnswer, reportAnswer, voteInPoll, type CircleQuestion, type ReportReason } from '@/core/api';
import { Button } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';

const REASONS: { reason: ReportReason; label: string }[] = [
  { reason: 'harmful', label: 'Harmful or unsafe' },
  { reason: 'offensive', label: 'Offensive' },
  { reason: 'personal_info', label: 'Shares personal information' },
  { reason: 'spam', label: 'Spam' }
];

export function QuestionView({ question, onChanged }: { question: CircleQuestion; onChanged: (q?: CircleQuestion) => void }) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const open = question.status === 'published';
  const poll = question.poll;
  const total = poll?.totals?.reduce((a, b) => a + b, 0) ?? 0;

  const vote = (i: number) => voteInPoll(question.id, i).then(q => onChanged(q)).catch(() => setNote('Your vote could not be saved.'));

  const send = async () => {
    if (text.trim().length < 2) {
      setNote('Write your answer first.');
      return;
    }
    setBusy(true);
    setNote(null);
    try {
      const r = await postAnswer(question.id, text.trim());
      setText('');
      setNote(r.showSupport
        ? 'Thank you for sharing. A moderator will review your answer. If you are in danger right now, please call your local emergency number.'
        : 'Thank you! Your answer will appear once a moderator approves it.');
      onChanged();
    } catch (e) {
      setNote(e instanceof ApiError && e.code === 'contact_details'
        ? 'Please remove links, emails and phone numbers. Answers are shared with everyone in the Circle.'
        : e instanceof ApiError && e.code === 'too_many_pending'
          ? 'Please wait for your earlier answers to be reviewed.'
          : 'Your answer could not be sent. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const actions = (a: CircleQuestion['answers'][number]) =>
    Alert.alert(a.handle, undefined, [
      { text: 'Report this answer', onPress: () => Alert.alert('Why are you reporting it?', undefined, [
        ...REASONS.map(r => ({ text: r.label, onPress: () => reportAnswer(a.id, r.reason).then(() => setNote('Thanks. A moderator will look at it.')).catch(() => undefined) })),
        { text: 'Cancel', style: 'cancel' as const }
      ]) },
      { text: `Block ${a.handle}`, style: 'destructive', onPress: () => blockHandle(a.handle).then(() => onChanged()).catch(() => undefined) },
      { text: 'Cancel', style: 'cancel' }
    ]);

  return (
    <View>
      <View style={styles.card}>
        <Text style={styles.eyebrow}>{open ? "This week's question" : 'Past question'}</Text>
        <Text style={styles.prompt} accessibilityRole="header">{question.prompt}</Text>

        {poll ? (
          <View style={{ gap: space.sm, marginTop: space.md }} accessibilityRole="radiogroup" accessibilityLabel="Poll">
            {poll.options.map((o, i) => {
              const count = poll.totals?.[i] ?? 0;
              const pct = total ? Math.round((count / total) * 100) : 0;
              const mine = poll.myVote === i;
              return (
                <Pressable
                  key={o}
                  disabled={!open}
                  accessibilityRole="radio"
                  accessibilityState={{ checked: mine }}
                  accessibilityLabel={poll.totals ? `${o}, ${pct} percent` : o}
                  onPress={() => vote(i)}
                  style={[styles.option, mine && styles.optionMine]}
                >
                  {poll.totals ? <View style={[styles.bar, { width: `${pct}%` }]} /> : null}
                  <Text style={[styles.optionText, mine && { color: colors.violetDark, fontFamily: fonts.label }]}>{o}{mine ? '  ✓' : ''}</Text>
                  {poll.totals ? <Text style={styles.pct}>{pct}%</Text> : null}
                </Pressable>
              );
            })}
            <Text style={styles.meta}>{poll.totals ? `${total} vote${total === 1 ? '' : 's'}` : 'Vote to see the results'}</Text>
          </View>
        ) : null}
      </View>

      {question.response ? (
        <View style={styles.response}>
          <Text style={styles.responseTitle}>From the PreConnix team</Text>
          <Text style={styles.responseText}>{question.response}</Text>
        </View>
      ) : null}

      <Text style={styles.h}>{question.answers.filter(a => a.status === 'approved').length} answers</Text>
      {question.answers.map(a => (
        <View key={a.id} style={[styles.answer, a.status === 'pending' && styles.pending]}>
          <View style={styles.answerHead}>
            <Text style={styles.handle}>{a.mine ? `${a.handle} (you)` : a.handle}</Text>
            {a.status === 'pending' ? <Text style={styles.waiting}>Waiting for approval</Text> : null}
            {!a.mine ? (
              <Text accessibilityRole="button" accessibilityLabel={`Report or block ${a.handle}`} style={styles.more} onPress={() => actions(a)}>•••</Text>
            ) : null}
          </View>
          <Text style={styles.body}>{a.body}</Text>
        </View>
      ))}

      {open ? (
        <View style={styles.compose}>
          <Text style={styles.h}>Share your answer</Text>
          <TextInput
            accessibilityLabel="Your answer"
            value={text}
            onChangeText={setText}
            placeholder="Shared under your username. A moderator reviews every answer."
            placeholderTextColor={colors.textMuted}
            multiline
            maxLength={1000}
            style={styles.input}
          />
          <Button label={busy ? 'Sending…' : 'Send for review'} onPress={send} disabled={busy} />
        </View>
      ) : null}
      {note ? <Text style={styles.note} accessibilityLiveRegion="polite">{note}</Text> : null}
      <Text style={styles.disclaimer}>The Circle is peer support, not medical advice. For anything about your own health, talk to a healthcare provider.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg },
  eyebrow: { fontFamily: fonts.label, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.roseDark },
  prompt: { fontFamily: fonts.heading, fontSize: 21, lineHeight: 28, color: colors.textPrimary, marginTop: space.xs },
  option: { minHeight: 48, justifyContent: 'center', borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, paddingHorizontal: space.md, overflow: 'hidden', flexDirection: 'row', alignItems: 'center' },
  optionMine: { borderColor: colors.violet },
  bar: { ...StyleSheet.absoluteFill, backgroundColor: colors.violetWash },
  optionText: { flex: 1, fontFamily: fonts.body, fontSize: 15, color: colors.textPrimary },
  pct: { fontFamily: fonts.label, fontSize: 14, color: colors.violetDark },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  response: { backgroundColor: colors.plum, borderRadius: radius.md, padding: space.lg, marginTop: space.md },
  responseTitle: { fontFamily: fonts.label, fontSize: 13, color: '#F4A0B3', marginBottom: space.xs },
  responseText: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.white },
  h: { fontFamily: fonts.heading, fontSize: 17, color: colors.textPrimary, marginTop: space.lg, marginBottom: space.sm },
  answer: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.sm, padding: space.md, marginBottom: space.sm },
  pending: { borderStyle: 'dashed', backgroundColor: colors.cream },
  answerHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginBottom: 4 },
  handle: { flex: 1, fontFamily: fonts.label, fontSize: 14, color: colors.violetDark },
  waiting: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary },
  more: { fontFamily: fonts.heading, fontSize: 16, color: colors.textSecondary, paddingHorizontal: space.sm, paddingVertical: 6 },
  body: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textPrimary },
  compose: { marginTop: space.sm },
  input: { minHeight: 100, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.white, padding: space.md, fontFamily: fonts.body, fontSize: 16, color: colors.textPrimary, textAlignVertical: 'top', marginBottom: space.sm },
  note: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.violetDark, marginTop: space.sm },
  disclaimer: { fontFamily: fonts.body, fontSize: 12, color: colors.textSecondary, marginTop: space.lg }
});
