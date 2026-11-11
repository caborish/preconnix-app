// Sign-in for returning users (Azure server): plain and short. "Create an account" goes to the intro's last screen,
// where the Terms of Use are agreed before the email step. An account without the agreement is asked for it after
// signing in.
import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { signInWithEmail } from '@/core/auth';
import { Button } from '@/design/components';
import { Wordmark } from '@/design/TabHeader';
import { colors, fonts, space } from '@/design/tokens';

export default function SignIn() {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const go = async () => {
    setBusy(true);
    setError(null);
    try {
      await signInWithEmail();
    } catch {
      setError('Sign-in did not work. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <Wordmark />
        <View style={styles.middle}>
          <Text style={styles.title} accessibilityRole="header">Welcome back</Text>
          <Text style={styles.text}>Sign in with your email. We'll send you a code.</Text>
        </View>
      </View>
      <View style={styles.footer}>
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
        <Button label={busy ? 'Opening…' : 'Sign in with email'} onPress={go} disabled={busy} />
        <Text style={styles.small}>
          New to PreConnix? <Text accessibilityRole="link" style={styles.link} onPress={() => router.replace('/welcome?step=create' as never)}>Create an account</Text>
        </Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  body: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.lg },
  middle: { flex: 1, justifyContent: 'center' },
  title: { fontFamily: fonts.heading, fontSize: 32, lineHeight: 38, color: colors.textPrimary, marginBottom: space.sm },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.md },
  small: { fontFamily: fonts.body, fontSize: 15, color: colors.textSecondary, textAlign: 'center' },
  link: { fontFamily: fonts.label, color: colors.violetDark },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert }
});
