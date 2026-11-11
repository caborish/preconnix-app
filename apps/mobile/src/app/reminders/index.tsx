import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, View } from 'react-native';
import { Text } from '@/design/Text';
import { Body, Button, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';
import { describe, type Reminder } from '@/features/reminders/model';
import { deleteReminder, ensurePermission, loadReminders, saveReminder } from '@/features/reminders/store';

export default function Reminders() {
  const [list, setList] = useState<Reminder[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  useFocusEffect(useCallback(() => { loadReminders().then(setList); }, []));

  const toggle = async (r: Reminder) => {
    setError(null);
    if (!r.enabled && !(await ensurePermission())) {
      setError('Notifications are turned off for Expo Go. Turn them on in your phone Settings to get reminders.');
      return;
    }
    saveReminder({ ...r, enabled: !r.enabled }).then(setList).catch(() => setError('That change could not be saved.'));
  };

  const remove = (r: Reminder) =>
    Alert.alert('Delete this reminder?', r.label, [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => deleteReminder(r.id).then(setList) }
    ]);

  return (
    <Screen footer={<Button label="Add a reminder" onPress={() => router.push('/reminders/new' as never)} />}>
      <Eyebrow>Reminders</Eyebrow>
      <Title>Your reminders</Title>
      <Body muted>Reminders stay on this phone. On the lock screen they say "You have a reminder" unless you choose to show the details.</Body>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {list && list.length === 0 ? <Body>No reminders yet.</Body> : null}
      {list?.map(r => (
        <View key={r.id} style={styles.row}>
          <Pressable accessibilityRole="button" accessibilityLabel={`Delete reminder ${r.label}`} onLongPress={() => remove(r)} style={{ flex: 1 }}>
            <Text style={[styles.label, !r.enabled && styles.off]}>{r.label}</Text>
            <Text style={styles.meta}>{describe(r)}{r.showDetail ? ' · details shown' : ''}</Text>
          </Pressable>
          <Switch
            accessibilityLabel={`${r.label} reminder ${r.enabled ? 'on' : 'off'}`}
            value={r.enabled}
            onValueChange={() => toggle(r)}
            trackColor={{ true: colors.violet, false: '#D9D2E3' }}
          />
          <Text accessibilityRole="button" accessibilityLabel={`Delete ${r.label}`} style={styles.del} onPress={() => remove(r)}>
            Delete
          </Text>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.md, marginBottom: space.sm, minHeight: 68 },
  label: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  off: { color: colors.textSecondary },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  del: { fontFamily: fonts.bodyMedium, fontSize: 13, color: colors.alert, paddingVertical: 12 },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert, marginBottom: space.sm }
});
