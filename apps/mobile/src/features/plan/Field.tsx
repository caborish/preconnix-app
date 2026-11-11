import { StyleSheet, TextInput, View, type KeyboardTypeOptions } from 'react-native';
import { Text } from '@/design/Text';
import { colors, fonts, radius, space } from '@/design/tokens';

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
  maxLength,
  keyboardType,
  autoFocus
}: {
  label: string;
  value: string;
  onChangeText: (s: string) => void;
  placeholder?: string;
  multiline?: boolean;
  maxLength: number;
  keyboardType?: KeyboardTypeOptions;
  autoFocus?: boolean;
}) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor={colors.textMuted}
        multiline={multiline}
        maxLength={maxLength}
        keyboardType={keyboardType}
        autoFocus={autoFocus}
        style={[styles.input, multiline && styles.multi]}
      />
    </View>
  );
}

export const SectionLabel = ({ children }: { children: string }) => <Text style={styles.label}>{children}</Text>;

const styles = StyleSheet.create({
  wrap: { marginBottom: space.md },
  label: { fontFamily: fonts.label, fontSize: 14, color: colors.textPrimary, marginBottom: space.sm },
  input: { minHeight: 48, borderWidth: 1.5, borderColor: colors.border, borderRadius: radius.sm, backgroundColor: colors.white, paddingHorizontal: space.md, paddingVertical: space.sm, fontFamily: fonts.body, fontSize: 16, color: colors.textPrimary },
  multi: { minHeight: 96, textAlignVertical: 'top' }
});
