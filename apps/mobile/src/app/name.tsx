// "What should we call you?" (owner and Dr Gloria, 5 Nov 2026): optional, asked once after signing in, and changed
// any time from Account. The name greets her on Home, on her plan and in Dr Gloria's welcome letter.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { getMe, saveFirstName } from '@/core/api';
import { Button } from '@/design/components';
import { Icon } from '@/design/Icon';
import { Text } from '@/design/Text';
import { colors, fonts, radius, space } from '@/design/tokens';
import { Field } from '@/features/plan/Field';
import { markNameAsked } from '@/features/onboarding/state';

const VALID = /^[\p{L}][\p{L}\p{M}' -]{0,39}$/u;

export default function NameScreen() {
  const { edit } = useLocalSearchParams<{ edit?: string }>();
  const [name, setName] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => { getMe().then(me => setName(me.firstName ?? '')).catch(() => undefined); }, []);

  const leave = async () => {
    await markNameAsked();
    if (edit) router.back(); else router.replace('/home');
  };
  const save = async () => {
    const value = name.trim().replace(/\s+/g, ' ');
    if (value && !VALID.test(value)) { setError('Please use letters only.'); return; }
    setBusy(true);
    setError(null);
    try {
      await saveFirstName(value || null);
      await leave();
    } catch {
      setError('That did not save. Please check your connection and try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <SafeAreaView style={styles.safe} edges={['top', 'bottom']}>
      <View style={styles.body}>
        <View style={styles.badge}><Icon name="smile" size={36} color={colors.violetDark} /></View>
        <Text style={styles.title} accessibilityRole="header">What should we call you?</Text>
        <Text style={styles.text}>Your first name or a nickname. You can change it any time.</Text>
        <Field label="Your name" value={name} onChangeText={t => { setName(t); setError(null); }} placeholder="e.g. Ada" maxLength={40} autoFocus />
        {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
      </View>
      <View style={styles.footer}>
        <Button label={busy ? 'Saving…' : 'Save'} onPress={save} disabled={busy} />
        {edit ? null : <Button label="Skip for now" variant="secondary" onPress={leave} disabled={busy} />}
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  body: { flex: 1, paddingHorizontal: space.xl, paddingTop: space.xl * 2, gap: space.md },
  badge: { width: 72, height: 72, borderRadius: radius.md, backgroundColor: colors.violetWash, alignItems: 'center', justifyContent: 'center' },
  title: { fontFamily: fonts.heading, fontSize: 28, lineHeight: 34, color: colors.textPrimary },
  text: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textSecondary },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.lg, gap: space.sm },
  error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert }
});
