// Shared UI building blocks. Accessibility: real buttons and radio semantics, 48dp targets, visible labels.
import type { ReactNode, RefObject } from 'react';
import { Pressable, ScrollView, StyleSheet, View, type ScrollViewInstance } from 'react-native';
import { Text } from '@/design/Text';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeyboardLift } from './keyboard';
import { colors, fonts, radius, space } from './tokens';

/** `top`: the screen has no navigation header (tabs), so it keeps clear of the status bar itself. */
export function Screen({ children, footer, scrollRef, top }: { children: ReactNode; footer?: ReactNode; scrollRef?: RefObject<ScrollViewInstance | null>; top?: boolean }) {
  const kb = useKeyboardLift();
  return (
    <View ref={kb.root} style={[styles.safe, { paddingBottom: kb.lift }]}>
      <SafeAreaView style={styles.safe} edges={[...(top ? ['top' as const] : []), ...(kb.lift ? [] : ['bottom' as const]), 'left', 'right']}>
        <ScrollView
          ref={r => { kb.scroll.current = r; if (scrollRef) scrollRef.current = r; }}
          onScroll={kb.onScroll}
          scrollEventThrottle={64}
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
          keyboardDismissMode="interactive"
        >
          {children}
        </ScrollView>
        {footer ? <View style={styles.footer}>{footer}</View> : null}
      </SafeAreaView>
    </View>
  );
}

export function Eyebrow({ children }: { children: string }) {
  return <Text style={styles.eyebrow}>{children}</Text>;
}

export function Title({ children }: { children: ReactNode }) {
  return (
    <Text style={styles.title} accessibilityRole="header">
      {children}
    </Text>
  );
}

export function Body({ children, muted }: { children: ReactNode; muted?: boolean }) {
  return <Text style={[styles.body, muted && styles.muted]}>{children}</Text>;
}

export function Button({
  label,
  onPress,
  variant = 'primary',
  disabled
}: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary';
  disabled?: boolean;
}) {
  const primary = variant === 'primary';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled: !!disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        primary ? styles.buttonPrimary : styles.buttonSecondary,
        pressed && { opacity: 0.85 },
        disabled && { opacity: 0.5 }
      ]}
    >
      <Text style={[styles.buttonText, !primary && { color: colors.violetDark }]}>{label}</Text>
    </Pressable>
  );
}

export interface Choice {
  id: string;
  label: string;
}

/** Single-choice question card with radio-group semantics. */
export function ChoiceGroup({
  label,
  number,
  choices,
  selected,
  onSelect,
  error
}: {
  label: string;
  number?: number;
  choices: Choice[];
  selected?: string;
  onSelect: (id: string) => void;
  error?: boolean;
}) {
  const a11yLabel = number ? `Question ${number}: ${label}` : label;
  return (
    <View style={[styles.card, selected && styles.cardDone, error && styles.cardError]}>
      {number ? <Text style={styles.qnum}>{number}</Text> : null}
      <Text style={styles.qtext}>{label}</Text>
      <View accessibilityRole="radiogroup" accessibilityLabel={a11yLabel}>
        {choices.map(c => {
          const on = c.id === selected;
          return (
            <Pressable
              key={c.id}
              accessibilityRole="radio"
              accessibilityState={{ checked: on }}
              accessibilityLabel={c.label}
              onPress={() => onSelect(c.id)}
              style={[styles.option, on && styles.optionOn]}
            >
              <View style={[styles.radio, on && styles.radioOn]}>{on ? <View style={styles.radioDot} /> : null}</View>
              <Text style={[styles.optionText, on && styles.optionTextOn]}>{c.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {error ? <Text style={styles.errorText}>Please choose an answer</Text> : null}
    </View>
  );
}

export function Divider({ children }: { children: string }) {
  return (
    <Text style={styles.divider} accessibilityRole="header">
      {children}
    </Text>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.cream },
  scroll: { padding: space.xl, paddingBottom: space.xxl },
  footer: { paddingHorizontal: space.xl, paddingBottom: space.lg, paddingTop: space.sm, gap: space.sm, backgroundColor: colors.cream },
  eyebrow: { fontFamily: fonts.heading, fontSize: 12, letterSpacing: 1.8, color: colors.roseDark, textTransform: 'uppercase', marginBottom: space.md },
  title: { fontFamily: fonts.headingBlack, fontSize: 32, lineHeight: 36, color: colors.textPrimary, marginBottom: space.md },
  body: { fontFamily: fonts.body, fontSize: 16, lineHeight: 24, color: colors.textSecondary, marginBottom: space.md },
  muted: { fontSize: 14, color: colors.textMuted },
  button: { minHeight: 52, borderRadius: radius.button, alignItems: 'center', justifyContent: 'center', paddingHorizontal: space.xl },
  // Key actions are rose (owner preference, 30 Oct 2026); secondary actions are violet on a light wash.
  buttonPrimary: { backgroundColor: colors.roseDark },
  buttonSecondary: { backgroundColor: colors.violetWash },
  buttonText: { fontFamily: fonts.heading, fontSize: 16, color: colors.white },
  card: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.border, borderRadius: radius.md, padding: space.lg, marginBottom: space.md },
  cardDone: { borderColor: 'rgba(46,173,130,0.35)' },
  cardError: { borderColor: colors.alert, borderWidth: 2 },
  qnum: { alignSelf: 'flex-start', backgroundColor: colors.roseDark, color: colors.white, fontFamily: fonts.heading, fontSize: 11, borderRadius: 6, paddingHorizontal: 7, paddingVertical: 3, overflow: 'hidden', marginBottom: space.sm },
  qtext: { fontFamily: fonts.bodyMedium, fontSize: 15, lineHeight: 22, color: colors.textPrimary, marginBottom: space.md },
  option: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: 48, paddingHorizontal: space.md, paddingVertical: space.sm, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, marginBottom: 6 },
  optionOn: { borderColor: colors.violet, backgroundColor: colors.violetWash },
  radio: { width: 20, height: 20, borderRadius: 10, borderWidth: 2, borderColor: '#B7ABC4', alignItems: 'center', justifyContent: 'center' },
  radioOn: { borderColor: colors.violet, backgroundColor: colors.violet },
  radioDot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.white },
  optionText: { flex: 1, fontFamily: fonts.body, fontSize: 15, lineHeight: 21, color: colors.textPrimary },
  optionTextOn: { fontFamily: fonts.bodyMedium, color: colors.violetDark },
  errorText: { marginTop: space.xs, color: colors.alert, fontFamily: fonts.bodyMedium, fontSize: 13 },
  divider: { fontFamily: fonts.heading, fontSize: 12, letterSpacing: 1, textTransform: 'uppercase', color: colors.roseDark, marginTop: space.md, marginBottom: space.sm }
});

/** Selectable pill for short option lists (single choice). */
export function Chip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ checked: selected }}
      onPress={onPress}
      style={[chipStyles.chip, selected && chipStyles.on]}
    >
      <Text style={[chipStyles.text, selected && chipStyles.textOn]}>{label}</Text>
    </Pressable>
  );
}

export function ChipRow({ children, label }: { children: ReactNode; label: string }) {
  return (
    <View accessibilityRole="radiogroup" accessibilityLabel={label} style={chipStyles.row}>
      {children}
    </View>
  );
}

const chipStyles = StyleSheet.create({
  row: { flexDirection: 'row', flexWrap: 'wrap', gap: space.sm, marginBottom: space.md },
  chip: { minHeight: 44, justifyContent: 'center', paddingHorizontal: space.lg, borderRadius: radius.pill, borderWidth: 1.5, borderColor: colors.border, backgroundColor: colors.white },
  on: { borderColor: colors.violet, backgroundColor: colors.violetWash },
  text: { fontFamily: fonts.body, fontSize: 14, color: colors.textPrimary },
  textOn: { fontFamily: fonts.bodyMedium, color: colors.violetDark }
});
