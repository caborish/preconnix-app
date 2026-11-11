// Account (design handoff): profile card, then preferences (notifications, privacy and sharing), then account
// and support (sign-in and security, your data, help), sign out, policies and version. The profile shows only
// what exists today: the Circle username and the sign-in method. No avatar shortcut elsewhere in the app.
import Constants from 'expo-constants';
import { router, useFocusEffect } from 'expo-router';
import { useCallback, useState, type ReactNode } from 'react';
import { Alert, Linking, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { getCircleHandle } from '@/core/api';
import { isSignedIn, signOut } from '@/core/auth';
import { Screen } from '@/design/components';
import { Icon, type IconName } from '@/design/Icon';
import { TabHeader } from '@/design/TabHeader';
import { colors, fonts, radius, space } from '@/design/tokens';
import { PolicyLinks } from '@/features/consent/ConsentList';

const SUPPORT_EMAIL = 'hello@preconnix.com';

function Group({ title, children }: { title: string; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <Text style={styles.groupTitle} accessibilityRole="header">{title}</Text>
      <View style={styles.card}>{children}</View>
    </View>
  );
}

function Row({ icon, label, detail, onPress, last }: { icon: IconName; label: string; detail: string; onPress: () => void; last?: boolean }) {
  return (
    <Pressable accessibilityRole="button" accessibilityHint={detail} onPress={onPress} style={({ pressed }) => [styles.row, !last && styles.rowLine, pressed && { opacity: 0.8 }]}>
      <Icon name={icon} size={22} color={colors.violetDark} />
      <View style={{ flex: 1 }}>
        <Text style={styles.rowLabel}>{label}</Text>
        <Text style={styles.meta}>{detail}</Text>
      </View>
      <Icon name="chevron" size={20} color={colors.textMuted} />
    </Pressable>
  );
}

export default function Account() {
  const [handle, setHandle] = useState<string | null>(null);
  const [signedIn, setSignedIn] = useState(false);
  useFocusEffect(useCallback(() => {
    getCircleHandle().then(h => setHandle(h.handle)).catch(() => setHandle(null));
    isSignedIn().then(setSignedIn).catch(() => setSignedIn(false));
  }, []));

  const go = (href: string) => () => router.push(href as never);
  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can sign in again with your email at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } }
    ]);

  return (
    <Screen top>
      <TabHeader title="Account" subtitle="Your details, preferences and privacy." />

      <View style={styles.profile}>
        <View style={styles.avatar}><Icon name="account" size={28} color={colors.violetDark} /></View>
        <View style={{ flex: 1 }}>
          <Text style={styles.profileName}>{handle ?? 'Your account'}</Text>
          <Text style={styles.meta}>{handle ? 'Your community name in the Circle' : 'Community name appears once you join the Circle'}</Text>
          <Text style={styles.meta}>{signedIn ? 'Signed in with email' : 'Test account'}</Text>
        </View>
      </View>

      <Group title="Preferences">
        <Row icon="smile" label="Your name" detail="What we call you in the app" onPress={go('/name?edit=1')} />
        <Row icon="pulse" label="Your health details" detail="Height, weight, BMI and pregnancies" onPress={go('/settings/health')} />
        <Row icon="bell" label="Notifications" detail="Plan check-ins, review and your reminders" onPress={go('/settings/notifications')} />
        <Row icon="shield" label="Privacy & sharing" detail="Your privacy choices and saved results" onPress={go('/settings/privacy')} last />
      </Group>

      <Group title="Account & support">
        <Row icon="lock" label="Sign-in & security" detail="How you sign in" onPress={go('/settings/security')} />
        <Row icon="download" label="Your data" detail="Saved results, or delete your account" onPress={go('/settings/data')} />
        <Row icon="help" label="Help & support" detail="Get help from the PreConnix team" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}?subject=${encodeURIComponent('PreConnix app')}`).catch(() => undefined)} last />
      </Group>

      {signedIn ? (
        <Pressable accessibilityRole="button" onPress={confirmSignOut} style={styles.signOut}>
          <Icon name="logout" size={20} color={colors.textSecondary} />
          <Text style={styles.signOutText}>Sign out</Text>
        </Pressable>
      ) : null}

      <PolicyLinks />
      <Text style={styles.version}>PreConnix · v{Constants.expoConfig?.version ?? ''}</Text>
    </Screen>
  );
}

const styles = StyleSheet.create({
  profile: { flexDirection: 'row', alignItems: 'center', gap: space.md, backgroundColor: colors.violetWash, borderRadius: radius.md, padding: space.lg },
  avatar: { width: 56, height: 56, borderRadius: 28, backgroundColor: colors.white, alignItems: 'center', justifyContent: 'center' },
  profileName: { fontFamily: fonts.heading, fontSize: 20, color: colors.textPrimary, marginBottom: 2 },
  group: { marginTop: space.xl },
  groupTitle: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.2, textTransform: 'uppercase', color: colors.violetDark, marginBottom: space.sm },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, paddingHorizontal: space.lg },
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 64, paddingVertical: space.sm },
  rowLine: { borderBottomWidth: 1, borderBottomColor: colors.border },
  rowLabel: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  signOut: { flexDirection: 'row', alignItems: 'center', gap: space.sm, paddingVertical: space.lg, marginTop: space.md },
  signOutText: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textSecondary },
  version: { fontFamily: fonts.body, fontSize: 12, color: colors.textMuted, textAlign: 'center', marginTop: space.md }
});
