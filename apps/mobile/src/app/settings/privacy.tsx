import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Alert, Platform, StyleSheet } from 'react-native';
import { Text } from '@/design/Text';
import { deleteAllAssessments, getMe, listSavedAssessments, problemMessage, saveConsents } from '@/core/api';
import { Body, Button, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts, space } from '@/design/tokens';
import { AgreementRow, AiRow, emptyChoices, fromConsents, MarketingRow, toConsents, type PrivacyChoices } from '@/features/consent/ConsentList';

const platform = () => (Platform.OS === 'ios' ? 'ios' : 'android') as 'ios' | 'android';

export default function PrivacySettings() {
  const [saved, setSaved] = useState<PrivacyChoices | null>(null);
  const [choices, setChoices] = useState<PrivacyChoices>(emptyChoices());
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [aiOffered, setAiOffered] = useState(false);

  useFocusEffect(useCallback(() => {
    getMe()
      .then(me => { const c = fromConsents(me.consents); setSaved(c); setChoices(c); setAiOffered(me.aiExplanation); })
      .catch(e => setMessage(problemMessage(e)));
  }, []));

  const changed = saved ? toConsents(choices, saved) : {};
  const hasChanges = Object.keys(changed).length > 0;

  const deleteAll = async () => {
    const r = await deleteAllAssessments();
    setMessage(`Deleted ${r.deleted} saved result${r.deleted === 1 ? '' : 's'}.`);
  };

  const onSave = async () => {
    if (!hasChanges) return;
    setBusy(true);
    setMessage(null);
    try {
      await saveConsents(changed, platform());
      setSaved(choices);
      setMessage('Your choices are saved.');
      if (changed.terms_privacy === false && (await listSavedAssessments()).length > 0) {
        Alert.alert('Delete your saved results too?', 'Without the agreement, PreConnix cannot give you new results. You can also delete the ones already saved.', [
          { text: 'Keep them', style: 'cancel' },
          { text: 'Delete all', style: 'destructive', onPress: () => deleteAll().catch(() => setMessage('Saved results could not be deleted.')) }
        ]);
      }
    } catch {
      setMessage('Your choices could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  const onDeleteAll = () =>
    Alert.alert('Delete all saved results?', 'Every saved result will be permanently removed. This cannot be undone.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete all', style: 'destructive', onPress: () => deleteAll().catch(() => setMessage('Saved results could not be deleted.')) }
    ]);

  return (
    <Screen
      footer={
        <>
          {message ? <Text style={styles.message} accessibilityLiveRegion="polite">{message}</Text> : null}
          <Button label={busy ? 'Saving…' : 'Save my choices'} onPress={onSave} disabled={!hasChanges || busy} />
          <Button label="Delete all saved results" variant="secondary" onPress={onDeleteAll} />
        </>
      }
    >
      <Eyebrow>Settings</Eyebrow>
      <Title>Privacy</Title>
      {saved ? (
        <>
          <AgreementRow checked={choices.agreement} onChange={agreement => setChoices(c => ({ ...c, agreement }))} />
          {!choices.agreement && saved.agreement ? (
            <Body muted>Without this agreement, PreConnix cannot calculate new results for you.</Body>
          ) : null}
          <MarketingRow checked={choices.marketing} onChange={marketing => setChoices(c => ({ ...c, marketing }))} />
          {aiOffered || saved.ai ? <AiRow checked={choices.ai} onChange={ai => setChoices(c => ({ ...c, ai }))} /> : null}
        </>
      ) : (
        <ActivityIndicator color={colors.violet} style={{ marginVertical: space.lg }} />
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({ message: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.textPrimary } });
