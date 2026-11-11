// The one agreement (owner, 1 Nov 2026): shown when a signed-in account has not agreed yet (for example an
// account from before, or someone who signed in rather than signing up). `?next=back` returns to where the person
// was; otherwise it opens Home. Nothing is pre-ticked.
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useState } from 'react';
import { Platform, StyleSheet } from 'react-native';
import { Text } from '@/design/Text';
import { problemMessage, saveAgreement } from '@/core/api';
import { Body, Button, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts } from '@/design/tokens';
import { AgreementRow } from '@/features/consent/ConsentList';
import { markOnboarded, privacySetupClosed } from '@/features/onboarding/state';

export default function Consent() {
  const { next } = useLocalSearchParams<{ next?: string }>();
  const [agreed, setAgreed] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => privacySetupClosed, []);

  const onContinue = async () => {
    if (!agreed) {
      setError('To continue, tick the box agreeing to the Terms of Use and Privacy Policy.');
      return;
    }
    setSaving(true);
    setError(null);
    try {
      await saveAgreement(Platform.OS === 'ios' ? 'ios' : 'android');
      await markOnboarded();
      if (next === 'back') router.back();
      else {
        // Leave the welcome steps behind so "back" never returns to them.
        if (router.canDismiss()) router.dismissAll();
        router.replace('/home');
      }
    } catch (e) {
      setError(`Your agreement could not be saved. ${problemMessage(e)}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button label={saving ? 'Saving…' : 'Continue'} onPress={onContinue} disabled={saving} />
        </>
      }
    >
      <Eyebrow>Before you continue</Eyebrow>
      <Title>Terms of Use</Title>
      <Body>Please read and agree to the Terms of Use and Privacy Policy to use PreConnix.</Body>
      <AgreementRow checked={agreed} onChange={v => { setAgreed(v); setError(null); }} />
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert } });
