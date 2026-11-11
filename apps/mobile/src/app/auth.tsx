// The email sign-in comes back here when Android reopens the app with the link (preconnix:///auth?code=…) instead
// of handing it to the sign-in screen (Galaxy S9, 5 Nov 2026). Finishes the sign-in, then goes to the start page.
// The code is never shown, logged or kept in the address.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { finishSignIn } from '@/core/auth';
import { Button } from '@/design/components';
import { Text } from '@/design/Text';
import { colors, fonts, space } from '@/design/tokens';

export default function AuthReturn() {
  const { code, state } = useLocalSearchParams<{ code?: string; state?: string }>();
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    if (!code) { router.replace('/'); return; }
    finishSignIn(String(code), state ? String(state) : undefined)
      .then(ok => (ok ? router.replace('/') : setFailed(true)))
      .catch(() => setFailed(true));
  }, [code, state]);

  return (
    <View style={styles.page}>
      {failed ? (
        <>
          <Text style={styles.text}>Sign-in did not finish. Please try again.</Text>
          <Button label="Back to sign-in" onPress={() => router.replace('/sign-in' as never)} />
        </>
      ) : (
        <>
          <ActivityIndicator color={colors.violetDark} />
          <Text style={styles.text}>Signing you in…</Text>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  page: { flex: 1, backgroundColor: colors.cream, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.md },
  text: { fontFamily: fonts.body, fontSize: 16, color: colors.textSecondary, textAlign: 'center' }
});
