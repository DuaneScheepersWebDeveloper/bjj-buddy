import { forwardRef, useState, type ReactNode } from 'react';
import { StyleSheet, Text, TextInput, View, type TextInputProps } from 'react-native';
import { colors, radius, space } from '../theme';

type Props = TextInputProps & {
  label: string;
  /** Optional control shown inside the field on the right, e.g. a Show/Hide button. */
  right?: ReactNode;
};

export const TextField = forwardRef<TextInput, Props>(function TextField({ label, right, style, ...rest }, ref) {
  const [focused, setFocused] = useState(false);
  return (
    <View style={styles.wrap}>
      <Text style={styles.label}>{label}</Text>
      <View style={[styles.box, focused && styles.boxFocused]}>
        <TextInput
          ref={ref}
          placeholderTextColor={colors.textMuted}
          selectionColor={colors.accent}
          style={[styles.input, style]}
          {...rest}
          onFocus={(e) => {
            setFocused(true);
            rest.onFocus?.(e);
          }}
          onBlur={(e) => {
            setFocused(false);
            rest.onBlur?.(e);
          }}
        />
        {right}
      </View>
    </View>
  );
});

const styles = StyleSheet.create({
  wrap: { marginBottom: space(4) },
  label: {
    color: colors.textMuted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.4,
    marginBottom: space(2),
  },
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.surfaceRaised,
    borderWidth: 1.5,
    borderColor: colors.border,
    borderRadius: radius.md,
    minHeight: 52,
  },
  boxFocused: { borderColor: colors.borderFocus },
  input: {
    flex: 1,
    color: colors.text,
    fontSize: 16, // 16+ stops iOS Safari zooming in on focus
    paddingHorizontal: space(4),
    paddingVertical: space(3),
  },
});
