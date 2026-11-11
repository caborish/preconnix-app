// Your data: saved results, a copy of all your data, and deleting the account (design handoff: never one tap; explain first, then
// confirm). Deleting removes the account on the server and clears what this phone keeps for it.
import { router } from 'expo-router';
import { useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { deleteAccount, problemMessage } from '@/core/api';
import { signOut } from '@/core/auth';
import { Body, Button, Screen, Title } from '@/design/components';
import { Icon } from '@/design/Icon';
import { colors, fonts, radius, space } from '@/design/tokens';
import { shareMyData } from '@/features/account/exportData';
import { CheckRow } from '@/features/consent/ConsentList';
import { clearLearnData } from '@/features/learn/progress';
import { deleteAllReminders } from '@/features/reminders/store';

const REMOVED = ['Your assessment results', 'Your plan, goals, steps and check-ins', 'Your Circle answers, votes and username', 'Your privacy choices', 'Reminders, lesson progress and saved lessons on this phone'];

export default function YourData() {
  const [understood, setUnderstood] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [exportError, setExportError] = useState<string | null>(null);

  const download = async () => {
    setExporting(true);
    setExportError(null);
    try {
      await shareMyData();
    } catch (e) {
      setExportError(`Your data could not be downloaded. ${problemMessage(e)}`);
    } finally {
      setExporting(false);
    }
  };

  const remove = async () => {
    setBusy(true);
    setError(null);
    try {
      await deleteAccount();
      await deleteAllReminders().catch(() => undefined);
      await clearLearnData();
      Alert.alert('Account deleted', 'Your PreConnix account and its data have been deleted.');
      await signOut();
    } catch (e) {
      setError(`Your account was not deleted. ${problemMessage(e)}`);
      setBusy(false);
    }
  };

  const confirm = () => {
    if (!understood) {
      setError('Tick the box to confirm you understand first.');
      return;
    }
    Alert.alert('Delete your account?', 'This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete my account', style: 'destructive', onPress: remove }
    ]);
  };

  return (
    <Screen>
      <Title>Your data</Title>
      <Pressable accessibilityRole="button" onPress={() => router.push('/history' as never)} style={styles.row}>
        <Icon name="clipboard" size={22} color={colors.violetDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>My saved results</Text>
          <Text style={styles.meta}>Open, share or delete past results</Text>
        </View>
        <Icon name="chevron" size={20} color={colors.textMuted} />
      </Pressable>
      <Pressable accessibilityRole="button" accessibilityState={{ busy: exporting }} disabled={exporting} onPress={download} style={styles.row}>
        <Icon name="download" size={22} color={colors.violetDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{exporting ? 'Preparing your data…' : 'Download a copy of my data'}</Text>
          <Text style={styles.meta}>Your results, answers, plan, privacy choices and Circle posts, in one file</Text>
        </View>
        <Icon name="chevron" size={20} color={colors.textMuted} />
      </Pressable>
      {exportError ? <Text style={styles.error} accessibilityLiveRegion="polite">{exportError}</Text> : null}

      <Text style={styles.h} accessibilityRole="header">Delete my account</Text>
      <View style={styles.danger}>
        <Text style={styles.label}>Deleting your account removes:</Text>
        {REMOVED.map(r => <Text key={r} style={styles.item}>• {r}</Text>)}
        <Text style={[styles.meta, { marginTop: space.sm }]}>This cannot be undone. If you sign in with the same email later, you start with a new, empty account.</Text>
      </View>
      <CheckRow checked={understood} onPress={() => { setUnderstood(v => !v); setError(null); }} title="I understand my account and data will be deleted." />
      {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      <Pressable accessibilityRole="button" accessibilityState={{ disabled: busy }} disabled={busy} onPress={confirm} style={styles.deleteButton}>
        <Text style={styles.deleteText}>{busy ? 'Deleting…' : 'Delete my account'}</Text>
      </Pressable>
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  label: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 2 },
  h: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary, marginTop: space.xl, marginBottom: space.sm },
  danger: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: 'rgba(198,40,40,0.35)', borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  item: { fontFamily: fonts.body, fontSize: 14, lineHeight: 22, color: colors.textPrimary },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert, marginBottom: space.sm },
  deleteButton: { minHeight: 52, borderRadius: radius.button, borderWidth: 1.5, borderColor: colors.alert, alignItems: 'center', justifyContent: 'center', marginTop: space.sm },
  deleteText: { fontFamily: fonts.heading, fontSize: 16, color: colors.alert }
});
