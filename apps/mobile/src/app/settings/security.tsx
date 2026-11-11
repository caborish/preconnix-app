// Sign-in & security: how the person signs in (a one-time code sent to their email; no password to manage).
import { Alert, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { useEffect, useState } from 'react';
import { isSignedIn, signOut } from '@/core/auth';
import { Body, Button, Screen, Title } from '@/design/components';
import { Icon } from '@/design/Icon';
import { colors, fonts, radius, space } from '@/design/tokens';

export default function Security() {
  const [signedIn, setSignedIn] = useState(false);
  useEffect(() => { isSignedIn().then(setSignedIn).catch(() => setSignedIn(false)); }, []);
  const confirm = () =>
    Alert.alert('Sign out?', 'You can sign in again with your email at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => { signOut(); } }
    ]);

  return (
    <Screen footer={signedIn ? <Button label="Sign out" variant="secondary" onPress={confirm} /> : undefined}>
      <Title>Sign-in & security</Title>
      <View style={styles.card}>
        <Icon name="lock" size={22} color={colors.violetDark} />
        <View style={{ flex: 1 }}>
          <Text style={styles.label}>{signedIn ? 'Email code' : 'Test account'}</Text>
          <Text style={styles.meta}>{signedIn ? 'Each time you sign in, a one-time code is sent to your email. There is no password to remember or reset.' : 'This test build uses a test account on the local server.'}</Text>
        </View>
      </View>
      <Body muted>Sign out on phones you share with others.</Body>
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  label: { fontFamily: fonts.label, fontSize: 16, color: colors.textPrimary, marginBottom: 2 },
  meta: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary }
});
