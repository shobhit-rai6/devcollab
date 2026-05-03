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

function PasswordStrength({ password }) {
  const strength =
    password.length === 0 ? 0 :
    password.length < 6   ? 1 :
    password.length < 10  ? 2 : 3;

  const labels = ['', 'Weak', 'Good', 'Strong'];
  const barColors = ['', colors.red, colors.yellow, colors.green];

  if (password.length === 0) return null;

  return (
    <View style={{ marginTop: 6, marginBottom: 4 }}>
      <View style={{ flexDirection: 'row', gap: 4 }}>
        {[1, 2, 3].map(i => (
          <View
            key={i}
            style={{
              flex: 1, height: 3, borderRadius: 2,
              backgroundColor: i <= strength ? barColors[strength] : 'rgba(255,255,255,0.08)',
            }}
          />
        ))}
      </View>
      <Text style={{ fontSize: 11, color: barColors[strength], marginTop: 4 }}>
        {labels[strength]} password
      </Text>
    </View>
  );
}

export default function RegisterScreen({ navigation }) {
  const [email,    setEmail]    = useState('');
  const [password, setPassword] = useState('');
  const [showPass, setShowPass] = useState(false);
  const [loading,  setLoading]  = useState(false);
  const [error,    setError]    = useState('');

  const { login } = useContext(UserContext);

  const handleSubmit = async () => {
    if (!email.trim() || password.length < 6) {
      setError('Please enter a valid email and a password of at least 6 characters.');
      return;
    }
    setError('');
    setLoading(true);
    try {
      const res = await axios.post('/users/register', { email, password });
      await login(res.data.user, res.data.token);
    } catch (err) {
      setError(
        err.response?.data?.message ||
        err.response?.data?.error  ||
        'Registration failed. Please try again.',
      );
    } finally {
      setLoading(false);
    }
  };

  return (
    <SafeAreaView style={styles.root}>
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

            <Text style={styles.title}>Create your account</Text>
            <Text style={styles.subtitle}>
              Start building with{' '}
              <Text style={{ color: colors.indigo }}>AI‑assisted code generation</Text>
              {' '}and real‑time collaboration.
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

            <View style={{ marginBottom: spacing.md }}>
              <View style={{ position: 'relative' }}>
                <StyledInput
                  label="Password"
                  value={password}
                  onChangeText={setPassword}
                  placeholder="At least 6 characters"
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
              <PasswordStrength password={password} />
            </View>

            <GradientButton
              title="Create account →"
              onPress={handleSubmit}
              loading={loading}
              style={{ marginTop: 4 }}
            />

            <Text style={styles.footer}>
              Already have an account?{' '}
              <Text
                style={styles.link}
                onPress={() => navigation.replace('Login')}
              >
                Sign in →
              </Text>
            </Text>

            <Text style={styles.terms}>
              By registering you agree to our Terms of Service.
            </Text>
          </View>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  blob1: {
    position: 'absolute', top: -120, left: -120,
    width: 340, height: 340, borderRadius: 170,
    backgroundColor: 'rgba(99,102,241,0.12)',
  },
  blob2: {
    position: 'absolute', bottom: -100, right: -100,
    width: 280, height: 280, borderRadius: 140,
    backgroundColor: 'rgba(236,72,153,0.08)',
  },
  scroll: { flexGrow: 1, justifyContent: 'center', padding: spacing.lg },
  card: {
    backgroundColor: 'rgba(14,17,23,0.95)',
    borderWidth: 1, borderColor: colors.border,
    borderRadius: 24, padding: spacing.lg,
    ...shadows.card,
  },
  logoRow: { flexDirection: 'row', alignItems: 'center', gap: 10, marginBottom: spacing.lg },
  logoMark: {
    width: 38, height: 38,
    backgroundColor: colors.primary,
    borderRadius: 11, alignItems: 'center', justifyContent: 'center',
    ...shadows.button,
  },
  logoIcon: { fontSize: 18 },
  logoText: { fontSize: 18, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.3 },
  title: { fontSize: 26, fontWeight: '800', color: colors.textPrimary, letterSpacing: -0.5, marginBottom: 6 },
  subtitle: { fontSize: 14, color: colors.textMuted, lineHeight: 20, marginBottom: spacing.lg },
  eyeBtn: { position: 'absolute', right: 14, bottom: 12, padding: 4 },
  eyeIcon: { fontSize: 16 },
  footer: { textAlign: 'center', marginTop: spacing.md, color: colors.textMuted, fontSize: 13 },
  link: { color: colors.indigo, fontWeight: '600' },
  terms: { textAlign: 'center', marginTop: 8, color: colors.textDimmed, fontSize: 11, lineHeight: 16 },
});
