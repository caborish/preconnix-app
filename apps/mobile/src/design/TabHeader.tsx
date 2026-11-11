// Top of each tab: the Flourish mark and bold "PreConnix" wordmark on the left (owner's layout, 30 Oct 2026; Flourish mark 1 Nov 2026),
// then an optional eyebrow, the screen title and one supporting line. No avatar or profile shortcut in the
// header: Account is the profile destination.
import { StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { SvgXml } from 'react-native-svg';
import { BRAND_NAME, FLOURISH_SVG } from '@preconnix/content';
import { colors, fonts, space } from './tokens';

export function Wordmark() {
  return (
    <View style={styles.brand} accessible accessibilityRole="header" accessibilityLabel="PreConnix">
      <SvgXml xml={FLOURISH_SVG} width={24} height={24} />
      <Text style={styles.wordmark}>{BRAND_NAME}</Text>
    </View>
  );
}

export function TabHeader({ eyebrow, title, subtitle }: { eyebrow?: string; title: string; subtitle?: string }) {
  return (
    <View style={styles.wrap}>
      <Wordmark />
      {eyebrow ? <Text style={styles.eyebrow}>{eyebrow}</Text> : null}
      <Text style={styles.title} accessibilityRole="header">{title}</Text>
      {subtitle ? <Text style={styles.subtitle}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { marginBottom: space.lg },
  brand: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: space.xl },
  wordmark: { fontFamily: fonts.heading, fontSize: 22, letterSpacing: -0.4, color: colors.textPrimary },
  eyebrow: { fontFamily: fonts.label, fontSize: 11, letterSpacing: 1.6, textTransform: 'uppercase', color: colors.roseDark, marginBottom: space.sm },
  title: { fontFamily: fonts.heading, fontSize: 27, lineHeight: 33, color: colors.textPrimary },
  subtitle: { fontFamily: fonts.body, fontSize: 14, lineHeight: 20, color: colors.textSecondary, marginTop: space.xs }
});
