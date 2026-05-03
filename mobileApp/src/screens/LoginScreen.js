import React, { useState, useContext } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  ScrollView, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { UserContext } from '../context/UserContext';
import { StyledInput, GradientButton, ErrorBanner } from '../components/UI';
import { colors, radius, spacing, shadows } from '../theme';
import axios from '../config/axios';

export default function LoginScreen({ navigation }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const { login } = useContext(UserContext);

  const handleSubmit = async () => {
    if (!email.trim() || !password.trim()) {
      setError('Please enter email and password.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/users/login', { email, password });
      await login(res.data.user, res.data.token);
      // Navigator auto-switches to Home after user state update
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.error  ||
        'Invalid email or password.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
      {/* Background glow blobs (native workaround) */}
      <View style={styles.blob1} />
      <View style={styles.blob2} />

      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        style={{ flex: 1 }}
      >
        <ScrollView
          contentContainerStyle={styles.scroll}
          keyboardShouldPersistTaps="handled"
        >
          <View style={styles.card}>
            {/* Logo */}
            <View style={styles.logoRow}>
              <View style={styles.logoMark}>
                <Text style={styles.logoIcon}>⚡</Text>
              </View>
              <Text style={styles.logoText}>DevCollab</Text>
            </View>

            <Text style={styles.title}>Welcome back</Text>
            <Text style={styles.subtitle}>
              Sign in to continue to your projects.{' '}
              <Text style={{ color: colors.indigo }}>AI‑powered collaboration</Text> awaits.
            </Text>

            <ErrorBanner message={error} />

            <StyledInput
              label="Email address"
              value={email}
              onChangeText={setEmail}
              placeholder="you@example.com"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              returnKeyType="next"
            />

            <View style={{ position: 'relative', marginBottom: spacing.md }}>
              <StyledInput
                label="Password"
                value={password}
                onChangeText={setPassword}
                placeholder="••••••••"
                secureTextEntry={!showPass}
                autoCapitalize="none"
                returnKeyType="done"
                onSubmitEditing={handleSubmit}
                style={{ marginBottom: 0 }}
              />
              <TouchableOpacity
                style={styles.eyeBtn}
                onPress={() => setShowPass(s => !s)}
              >
                <Text style={styles.eyeIcon}>{showPass ? '🙈' : '👁'}</Text>
              </TouchableOpacity>
            </View>

            <GradientButton
              title="Sign in →"
              onPress={handleSubmit}
              loading={loading}
              style={{ marginTop: 4 }}
            />

            <Text style={styles.footer}>
              No account yet?{' '}
              <Text
                style={styles.link}
                onPress={() => navigation.replace('Register')}
              >
                Create one free →
              </Text>
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  blob1: {
    position: 'absolute',
    top: -120, left: -120,
    width: 340, height: 340,
    borderRadius: 170,
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  blob2: {
    position: 'absolute',
    bottom: -100, right: -100,
    width: 280, height: 280,
    borderRadius: 140,
    backgroundColor: 'rgba(236,72,153,0.08)',
  },
  scroll: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: spacing.lg,
  },
  card: {
    backgroundColor: 'rgba(14,17,23,0.95)',
    borderWidth: 1,
    borderColor: colors.border,
    borderRadius: 24,
    padding: spacing.lg,
    ...shadows.card,
  },
  logoRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 10,
    marginBottom: spacing.lg,
  },
  logoMark: {
    width: 38, height: 38,
    backgroundColor: colors.primary,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
    ...shadows.button,
  },
  logoIcon: { fontSize: 18 },
  logoText: {
    fontSize: 18,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.3,
  },
  title: {
    fontSize: 26,
    fontWeight: '800',
    color: colors.textPrimary,
    letterSpacing: -0.5,
    marginBottom: 6,
  },
  subtitle: {
    fontSize: 14,
    color: colors.textMuted,
    lineHeight: 20,
    marginBottom: spacing.lg,
  },
  eyeBtn: {
    position: 'absolute',
    right: 14,
    bottom: 12,
    padding: 4,
  },
  eyeIcon: { fontSize: 16 },
  footer: {
    textAlign: 'center',
    marginTop: spacing.md,
    color: colors.textMuted,
    fontSize: 13,
  },
  link: {
    color: colors.indigo,
    fontWeight: '600',
  },
});
