// A private support message with numbers to tap (Dr Gloria, Review 4).
import { Linking, Pressable, StyleSheet, View } from 'react-native';
import type { SupportMessage } from '@preconnix/content';
import { Text } from '@/design/Text';
import { colors, fonts, radius, space } from '@/design/tokens';

export function SupportCard({ message }: { message: SupportMessage }) {
  return (
    <View style={styles.card}>
      <Text style={styles.title} accessibilityRole="header">{message.title}</Text>
      {message.lines.map(l => <Text key={l} style={styles.line}>{l}</Text>)}
      {message.numbers.map(n => (
        <Pressable key={n.number} accessibilityRole="link" accessibilityLabel={`Call ${n.name}, ${n.number}`} onPress={() => Linking.openURL(`tel:${n.number.replace(/\s/g, '')}`)} style={styles.number}>
          <Text style={styles.name}>{n.name}</Text>
          <Text style={styles.digits}>{n.number}</Text>
        </Pressable>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  card: { backgroundColor: colors.roseWash, borderRadius: radius.md, padding: space.lg, marginBottom: space.sm },
  title: { fontFamily: fonts.heading, fontSize: 17, lineHeight: 23, color: colors.textPrimary, marginBottom: space.xs },
  line: { fontFamily: fonts.body, fontSize: 15, lineHeight: 22, color: colors.textPrimary, marginBottom: space.xs },
  number: { minHeight: 48, justifyContent: 'center', borderTopWidth: 1, borderTopColor: colors.border, marginTop: space.xs, paddingVertical: space.xs },
  name: { fontFamily: fonts.body, fontSize: 13, color: colors.textSecondary },
  digits: { fontFamily: fonts.label, fontSize: 16, color: colors.roseDark }
});
