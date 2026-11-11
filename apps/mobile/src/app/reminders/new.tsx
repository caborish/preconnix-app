import { router } from 'expo-router';
import { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Text } from '@/design/Text';
import { Button, Chip, ChipRow, Eyebrow, Screen, Title } from '@/design/components';
import { colors, fonts } from '@/design/tokens';
import { CheckRow } from '@/features/consent/ConsentList';
import { Field, SectionLabel } from '@/features/plan/Field';
import { useContent } from '@/features/content/store';
import { inDays, reminderProblems, TIME_OPTIONS, WEEKDAYS, type Frequency, type Reminder } from '@/features/reminders/model';
import { ensurePermission, saveReminder } from '@/features/reminders/store';

const ONCE_OPTIONS = [{ label: 'Tomorrow', days: 1 }, { label: 'In 3 days', days: 3 }, { label: 'In a week', days: 7 }, { label: 'In a month', days: 30 }];
const newId = () => `r-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`;

export default function NewReminder() {
  const { settings } = useContent();
  const [label, setLabel] = useState('');
  const [frequency, setFrequency] = useState<Frequency>('daily');
  const [time, setTime] = useState(TIME_OPTIONS[1]);
  const [weekday, setWeekday] = useState(2);
  const [days, setDays] = useState(1);
  const [showDetail, setShowDetail] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const reminder: Reminder = {
    id: newId(), label: label.trim(), frequency, hour: time.hour, minute: time.minute,
    weekday: frequency === 'weekly' ? weekday : undefined,
    date: frequency === 'once' ? inDays(days) : undefined,
    showDetail, enabled: true
  };
  const problems = reminderProblems(reminder);

  const onSave = async () => {
    if (problems.length) {
      setError(`To save: ${problems.join(', ').toLowerCase()}.`);
      return;
    }
    setBusy(true);
    setError(null);
    try {
      if (!(await ensurePermission())) {
        setError('Notifications are turned off for Expo Go. Turn them on in your phone Settings, then try again.');
        return;
      }
      await saveReminder(reminder);
      router.back();
    } catch {
      setError('The reminder could not be saved. Please try again.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <Screen
      footer={
        <>
          {error ? <Text style={styles.error} accessibilityLiveRegion="polite">{error}</Text> : null}
          <Button label={busy ? 'Saving…' : 'Save reminder'} onPress={onSave} disabled={busy} />
        </>
      }
    >
      <Eyebrow>Reminders</Eyebrow>
      <Title>New reminder</Title>
      <SectionLabel>Quick picks</SectionLabel>
      <ChipRow label="Reminder suggestions">
        {settings.reminderSuggestions.map(t => <Chip key={t} label={t} selected={label === t} onPress={() => setLabel(t)} />)}
      </ChipRow>
      <Field label="Reminder" value={label} onChangeText={setLabel} placeholder="Or write your own" maxLength={80} />

      <SectionLabel>How often</SectionLabel>
      <ChipRow label="How often">
        <Chip label="Every day" selected={frequency === 'daily'} onPress={() => setFrequency('daily')} />
        <Chip label="Every week" selected={frequency === 'weekly'} onPress={() => setFrequency('weekly')} />
        <Chip label="Once" selected={frequency === 'once'} onPress={() => setFrequency('once')} />
      </ChipRow>
      {frequency === 'weekly' ? (
        <ChipRow label="Day of the week">
          {WEEKDAYS.map((d, i) => <Chip key={d} label={d} selected={weekday === i + 1} onPress={() => setWeekday(i + 1)} />)}
        </ChipRow>
      ) : null}
      {frequency === 'once' ? (
        <ChipRow label="Which day">
          {ONCE_OPTIONS.map(o => <Chip key={o.label} label={o.label} selected={days === o.days} onPress={() => setDays(o.days)} />)}
        </ChipRow>
      ) : null}

      <SectionLabel>Time</SectionLabel>
      <ChipRow label="Time">
        {TIME_OPTIONS.map(t => <Chip key={t.label} label={t.label} selected={time.label === t.label} onPress={() => setTime(t)} />)}
      </ChipRow>

      <CheckRow
        checked={showDetail}
        onPress={() => setShowDetail(s => !s)}
        title="Show the reminder text on my lock screen"
        detail='Off: your lock screen just says "You have a reminder", so others cannot see what it is about.'
      />
    </Screen>
  );
}

const styles = StyleSheet.create({ error: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.alert } });
