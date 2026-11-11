// The saved result's share button (owner, 9 Nov 2026): one rounded square over the page, so the result stays in view.
// Tapping it opens the choices.
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { AssessmentResult } from '@/core/api';
import { Icon } from '@/design/Icon';
import { colors, radius, space } from '@/design/tokens';
import { EmailReportButton } from './EmailReportButton';
import { ShareReportButton } from './ShareReportButton';

export function ShareMenu({ result }: { result: AssessmentResult }) {
  const [open, setOpen] = useState(false);
  const bottom = useSafeAreaInsets().bottom + space.md;
  return (
    <>
      {open ? <Pressable accessibilityLabel="Close share options" onPress={() => setOpen(false)} style={StyleSheet.absoluteFill} /> : null}
      {open ? (
        <View style={[styles.menu, { bottom: bottom + 68 }]}>
          <EmailReportButton result={result} />
          <ShareReportButton result={result} />
        </View>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel="Share this result" accessibilityState={{ expanded: open }} onPress={() => setOpen(o => !o)} style={({ pressed }) => [styles.button, { bottom }, pressed && { opacity: 0.85 }]}>
        <Icon name="share" size={24} color={colors.white} />
      </Pressable>
    </>
  );
}

const styles = StyleSheet.create({
  button: { position: 'absolute', right: space.lg, width: 56, height: 56, borderRadius: 16, backgroundColor: colors.roseDark, alignItems: 'center', justifyContent: 'center', elevation: 6, shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 3 } },
  menu: { position: 'absolute', right: space.lg, left: space.lg, backgroundColor: colors.white, borderRadius: radius.md, borderWidth: 1, borderColor: colors.border, padding: space.md, gap: space.sm, elevation: 8, shadowColor: '#000', shadowOpacity: 0.18, shadowRadius: 10, shadowOffset: { width: 0, height: 4 } }
});
