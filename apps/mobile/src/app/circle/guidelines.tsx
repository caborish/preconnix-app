// Circle community guidelines. Wording approved by the owner in chat (30 Oct 2026); describes how the Circle works
// today (moderation before posting, reporting, blocking, contact details refused).
import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { Body, Screen, Title } from '@/design/components';
import { colors, fonts, radius, space } from '@/design/tokens';

const RULES: { title: string; text: string }[] = [
  { title: 'Be kind', text: 'Everyone here is on their own journey. Share with care and respect different choices, including the choice not to have children.' },
  { title: 'Share experience, not medical advice', text: 'The Circle is peer support. For anything about your own health, talk to a healthcare provider.' },
  { title: 'Keep personal details out', text: 'Do not share names, phone numbers, emails, addresses, links or photos, yours or anyone else\'s.' },
  { title: 'No harassment, hate or sexual content', text: 'Answers that attack, shame or exclude people are removed.' },
  { title: 'Every answer is reviewed', text: 'A moderator reads each answer before it appears. You can report an answer or block a username at any time.' },
  { title: 'If you need help now', text: 'If you or someone else is in danger, call your local emergency number.' }
];

export default function Guidelines() {
  return (
    <Screen>
      <Title>Community guidelines</Title>
      <Body>The Circle works when it feels safe for everyone.</Body>
      {RULES.map((r, i) => (
        <View key={r.title} style={styles.card}>
          <Text style={styles.num}>{i + 1}</Text>
          <View style={{ flex: 1 }}>
            <Text style={styles.title}>{r.title}</Text>
            <Text style={styles.text}>{r.text}</Text>
          </View>
        </View>
      ))}
    </Screen>
  );
}

const styles = StyleSheet.create({
  card: { flexDirection: 'row', gap: space.md, backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm },
  num: { fontFamily: fonts.heading, fontSize: 18, color: colors.roseDark, width: 20 },
  title: { fontFamily: fonts.label, fontSize: 16, color: colors.textPrimary, marginBottom: 4 },
  text: { fontFamily: fonts.body, fontSize: 14, lineHeight: 21, color: colors.textSecondary }
});
