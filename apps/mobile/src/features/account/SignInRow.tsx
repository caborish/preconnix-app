// Sign-in state on Home: sign in with an email code, or sign out.
import { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { isSignedIn, onSignInChange, signInWithEmail, signOut } from '@/core/auth';
import { colors, fonts, space } from '@/design/tokens';

export function SignInRow({ onChange }: { onChange?: () => void }) {
  const [signedIn, setSignedIn] = useState<boolean | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    isSignedIn().then(setSignedIn);
    return onSignInChange(setSignedIn);
  }, []);

  const signIn = async () => {
    setBusy(true);
    try {
      if (await signInWithEmail()) onChange?.();
    } catch {
      Alert.alert('Sign-in did not work', 'Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  const confirmSignOut = () =>
    Alert.alert('Sign out?', 'You can sign in again with your email at any time.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Sign out', style: 'destructive', onPress: () => signOut().then(() => onChange?.()) }
    ]);

  if (signedIn === null) return null;
  return (
    <View style={styles.row}>
      <View style={{ flex: 1 }}>
        <Text style={styles.title}>{signedIn ? 'Signed in with email' : 'Not signed in'}</Text>
        <Text style={styles.meta}>{signedIn ? 'Your results and plan are linked to your account.' : 'Sign in to keep your results and plan with your account.'}</Text>
      </View>
      <Pressable accessibilityRole="button" disabled={busy} onPress={signedIn ? confirmSignOut : signIn} hitSlop={8}>
        <Text style={styles.action}>{busy ? 'Opening…' : signedIn ? 'Sign out' : 'Sign in'}</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 56 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, color: colors.textPrimary },
  meta: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary, marginTop: 2 },
  action: { fontFamily: fonts.label, fontSize: 15, color: colors.violetDark, paddingVertical: 6 }
});
