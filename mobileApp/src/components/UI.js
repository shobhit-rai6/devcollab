import React from 'react';
import {
  TouchableOpacity, Text, View, TextInput as RNTextInput,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { colors, radius, spacing, shadows, fonts } from '../theme';

// ─── GradientButton ──────────────────────────────────────────────────────────
// Simulated gradient with a solid colour (expo-linear-gradient optional)
export function GradientButton({ title, onPress, loading, disabled, style, textStyle }) {
  return (
    <TouchableOpacity
      style={[styles.gradBtn, (disabled || loading) && styles.gradBtnDisabled, style]}
      onPress={onPress}
      disabled={disabled || loading}
      activeOpacity={0.8}
    >
      {loading
        ? <ActivityIndicator color="#fff" size="small" />
        : <Text style={[styles.gradBtnText, textStyle]}>{title}</Text>
      }
    </TouchableOpacity>
  );
}

// ─── SecondaryButton ─────────────────────────────────────────────────────────
export function SecondaryButton({ title, onPress, style }) {
  return (
    <TouchableOpacity
      style={[styles.secBtn, style]}
      onPress={onPress}
      activeOpacity={0.7}
    >
      <Text style={styles.secBtnText}>{title}</Text>
    </TouchableOpacity>
  );
}

// ─── StyledInput ─────────────────────────────────────────────────────────────
export function StyledInput({ label, style, inputStyle, ...props }) {
  const [focused, setFocused] = React.useState(false);
  return (
    <View style={[styles.inputWrap, style]}>
      {label && <Text style={styles.inputLabel}>{label}</Text>}
      <RNTextInput
        style={[
          styles.input,
          focused && styles.inputFocused,
          inputStyle,
        ]}
        placeholderTextColor={colors.textDimmed}
        onFocus={() => setFocused(true)}
        onBlur={() => setFocused(false)}
        {...props}
      />
    </View>
  );
}

// ─── ErrorBanner ─────────────────────────────────────────────────────────────
export function ErrorBanner({ message }) {
  if (!message) return null;
  return (
    <View style={styles.errorBanner}>
      <Text style={styles.errorText}>⚠ {message}</Text>
    </View>
  );
}

// ─── Card ────────────────────────────────────────────────────────────────────
export function Card({ children, style, onPress }) {
  const Wrapper = onPress ? TouchableOpacity : View;
  return (
    <Wrapper
      style={[styles.card, style]}
      onPress={onPress}
      activeOpacity={0.8}
    >
      {children}
    </Wrapper>
  );
}

// ─── Divider ─────────────────────────────────────────────────────────────────
export function Divider({ style }) {
  return <View style={[styles.divider, style]} />;
}

// ─── Tag / Badge ─────────────────────────────────────────────────────────────
export function Badge({ label, color, style }) {
  return (
    <View style={[styles.badge, { borderColor: color || colors.border }, style]}>
      <Text style={[styles.badgeText, { color: color || colors.textMuted }]}>{label}</Text>
    </View>
  );
}

// ─── Styles ──────────────────────────────────────────────────────────────────
const styles = StyleSheet.create({
  gradBtn: {
    backgroundColor: colors.primary,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.button,
  },
  gradBtnDisabled: { opacity: 0.55 },
  gradBtnText: {
    color: '#fff',
    fontSize: 15,
    fontWeight: '700',
    letterSpacing: 0.3,
  },

  secBtn: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  secBtnText: {
    color: colors.textMuted,
    fontSize: 14,
    fontWeight: '500',
  },

  inputWrap: { marginBottom: spacing.md },
  inputLabel: {
    fontSize: 12,
    fontWeight: '600',
    color: colors.textSecondary,
    textTransform: 'uppercase',
    letterSpacing: 0.8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.bgInput,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.md,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontSize: 15,
    color: colors.textPrimary,
  },
  inputFocused: {
    borderColor: colors.borderFocus,
    backgroundColor: 'rgba(99,102,241,0.05)',
  },

  errorBanner: {
    backgroundColor: 'rgba(239,68,68,0.1)',
    borderWidth: 1,
    borderColor: 'rgba(239,68,68,0.2)',
    borderRadius: radius.sm,
    paddingVertical: 10,
    paddingHorizontal: spacing.md,
    marginBottom: spacing.md,
  },
  errorText: { color: colors.redLight, fontSize: 13 },

  card: {
    backgroundColor: colors.bgCard,
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: radius.lg,
    padding: spacing.md,
  },

  divider: {
    height: 1,
    backgroundColor: colors.border,
    marginVertical: spacing.md,
  },

  badge: {
    borderWidth: 1,
    borderRadius: radius.full,
    paddingVertical: 3,
    paddingHorizontal: 10,
    alignSelf: 'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '500' },
});
