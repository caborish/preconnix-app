// Notifications: whether the phone allows PreConnix notifications, and what is scheduled (goal check-ins, the
// plan review, the person's own reminders). Changing permission happens in the phone's settings.
import * as Notifications from 'expo-notifications';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { Linking, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { Body, Button, Screen, Title } from '@/design/components';
import { Icon } from '@/design/Icon';
import { colors, fonts, radius, space } from '@/design/tokens';
import { describe, type Reminder } from '@/features/reminders/model';
import { ensurePermission, loadReminders } from '@/features/reminders/store';

export default function NotificationSettings() {
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [canAsk, setCanAsk] = useState(true);
  const [list, setList] = useState<Reminder[]>([]);

  const load = useCallback(() => {
    Notifications.getPermissionsAsync().then(p => { setAllowed(p.granted); setCanAsk(p.canAskAgain); }).catch(() => setAllowed(false));
    loadReminders().then(setList);
  }, []);
  useFocusEffect(load);

  const active = list.filter(r => r.enabled);
  const goals = active.filter(r => r.goalId);
  const review = active.find(r => r.id === 'plan-review');
  const own = active.filter(r => !r.goalId && r.id !== 'plan-review');

  return (
    <Screen footer={<Button label="Manage my reminders" variant="secondary" onPress={() => router.push('/reminders' as never)} />}>
      <Title>Notifications</Title>
      <View style={[styles.status, allowed ? styles.on : styles.off]}>
        <Icon name="bell" size={22} color={allowed ? colors.green : colors.roseDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.statusTitle}>{allowed === null ? 'Checking…' : allowed ? 'Notifications are on' : 'Notifications are off'}</Text>
          <Text style={styles.meta}>{allowed ? 'Your reminders will arrive on this phone.' : 'Reminders cannot arrive until you allow notifications.'}</Text>
        </View>
      </View>
      {allowed === false ? (
        canAsk
          ? <Button label="Allow notifications" onPress={() => ensurePermission().then(load)} />
          : <Button label="Open phone settings" onPress={() => Linking.openSettings()} />
      ) : null}

      <Text style={styles.h} accessibilityRole="header">Scheduled on this phone</Text>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Plan check-ins</Text>
        <Text style={styles.meta}>{goals.length ? `${goals.length} goal${goals.length === 1 ? '' : 's'}: ${goals.map(describe).join(' · ')}` : 'None. Set a reminder on any daily or weekly goal.'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Plan review</Text>
        <Text style={styles.meta}>{review ? describe(review) : 'None. Choose a review date when you set up your plan.'}</Text>
      </View>
      <View style={styles.card}>
        <Text style={styles.rowLabel}>Your reminders</Text>
        <Text style={styles.meta}>{own.length ? own.map(r => r.label).join(' · ') : 'None yet.'}</Text>
      </View>
      <Body muted>Learning and Circle notifications are not available yet.</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  status: { flexDirection: 'row', alignItems: 'center', gap: space.md, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  on: { backgroundColor: colors.greenWash },
  off: { backgroundColor: colors.roseWash },
  statusTitle: { fontFamily: fonts.label, fontSize: 16, color: colors.textPrimary },
  h: { fontFamily: fonts.heading, fontSize: 18, color: colors.textPrimary, marginTop: space.xl, marginBottom: space.sm },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm },
  rowLabel: { fontFamily: fonts.label, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 2 }
});
