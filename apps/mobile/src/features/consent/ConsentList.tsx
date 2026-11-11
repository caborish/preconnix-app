// Privacy choices (owner, 1 Nov 2026): one agreement to the Terms of Use and Privacy Policy, ticked before signing
// up; email tips are a separate opt-in in Privacy settings. Analytics and research are not asked because the app
// does not do either yet. Canadian (CASL) and Nigerian (NDPA) rules do not allow email tips to be bundled with what
// the service needs. Wording is a draft pending legal review (backlog H-11).
import * as WebBrowser from 'expo-web-browser';
import type { ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { Text } from '@/design/Text';
import { colors, fonts, radius, space } from '@/design/tokens';

export { emptyChoices, fromConsents, toConsents, type PrivacyChoices } from './model';

export function CheckRow({ checked, onPress, title, detail, children }: {
  checked: boolean;
  onPress: () => void;
  title: string;
  detail?: string;
  children?: ReactNode;
}) {
  return (
    <View style={[styles.item, checked && styles.itemOn]}>
      <Pressable accessibilityRole="checkbox" accessibilityState={{ checked }} accessibilityLabel={title} accessibilityHint={detail} onPress={onPress} style={styles.row}>
        <View style={[styles.box, checked && styles.boxOn]}>{checked ? <Text style={styles.tick}>✓</Text> : null}</View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{title}</Text>
          {detail ? <Text style={styles.detail}>{detail}</Text> : null}
        </View>
      </Pressable>
      {children}
    </View>
  );
}

export function PolicyLinks() {
  return (
    <View style={styles.links}>
      <Text accessibilityRole="link" style={styles.link} onPress={() => WebBrowser.openBrowserAsync('https://preconnix.com/terms/')}>
        Terms
      </Text>
      <Text accessibilityRole="link" style={styles.link} onPress={() => WebBrowser.openBrowserAsync('https://preconnix.com/privacy/')}>
        Privacy Policy
      </Text>
    </View>
  );
}

/** The one agreement (owner, 1 Nov 2026): the Terms of Use cover being 18+ and PreConnix keeping a record of results. */
export function AgreementRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <CheckRow checked={checked} onPress={() => onChange(!checked)} title="I agree to the Terms of Use and Privacy Policy.">
      <PolicyLinks />
    </CheckRow>
  );
}

/** Optional email tips: always separate and unticked (CASL / NDPA). Offered in Privacy settings only. */
export function MarketingRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <CheckRow
      checked={checked}
      onPress={() => onChange(!checked)}
      title="Email me tips and updates from PreConnix."
      detail="Optional. Unsubscribe any time."
    />
  );
}

/** The AI-assisted explanation of results (ADR-018): its own choice, asked when first used. */
export function AiRow({ checked, onChange }: { checked: boolean; onChange: (v: boolean) => void }) {
  return (
    <CheckRow
      checked={checked}
      onPress={() => onChange(!checked)}
      title="Explain my results with AI."
      detail="Optional. Not medical advice."
    />
  );
}

const styles = StyleSheet.create({
  item: { backgroundColor: colors.white, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  itemOn: { borderColor: colors.violet, backgroundColor: colors.violetWash },
  row: { flexDirection: 'row', gap: space.md, minHeight: 48 },
  box: { width: 24, height: 24, borderRadius: 6, borderWidth: 2, borderColor: '#B7ABC4', alignItems: 'center', justifyContent: 'center', marginTop: 2 },
  boxOn: { backgroundColor: colors.violet, borderColor: colors.violet },
  tick: { color: colors.white, fontFamily: fonts.heading, fontSize: 14 },
  title: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 21, color: colors.textPrimary },
  detail: { fontFamily: fonts.body, fontSize: 13, lineHeight: 19, color: colors.textSecondary, marginTop: 4 },
  links: { flexDirection: 'row', gap: space.xl, marginTop: space.sm, marginLeft: 36 },
  link: { fontFamily: fonts.bodyMedium, fontSize: 14, color: colors.violetDark, textDecorationLine: 'underline', paddingVertical: 8 }
});
