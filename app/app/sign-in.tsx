import { Redirect } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../lib/auth-context';
import { colors, radii, spacing, type as typeTokens } from '../lib/theme';

export default function SignInScreen() {
  const { session, loading, signIn, signUp } = useAuth();
  const [mode, setMode] = useState<'sign_in' | 'sign_up'>('sign_in');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.lavenderDeep} />
      </SafeAreaView>
    );
  }

  if (session) {
    return <Redirect href="/(tabs)" />;
  }

  async function handleSubmit() {
    setError(null);
    if (!email.trim() || !password) {
      setError('Enter an email and password.');
      return;
    }
    setSubmitting(true);
    const result = mode === 'sign_in' ? await signIn(email.trim(), password) : await signUp(email.trim(), password);
    setSubmitting(false);
    if (result.error) setError(result.error);
  }

  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <View style={styles.screen}>
          <Text style={styles.wordmark}>Paly</Text>
          <Text style={styles.subtitle}>
            {mode === 'sign_in' ? 'Welcome back.' : 'Create an account to start your first goal.'}
          </Text>

          <TextInput
            style={styles.input}
            placeholder="Email"
            placeholderTextColor={colors.muted}
            autoCapitalize="none"
            autoComplete="email"
            keyboardType="email-address"
            value={email}
            onChangeText={setEmail}
          />
          <TextInput
            style={styles.input}
            placeholder="Password"
            placeholderTextColor={colors.muted}
            secureTextEntry
            autoCapitalize="none"
            value={password}
            onChangeText={setPassword}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.submit} onPress={handleSubmit} disabled={submitting}>
            {submitting ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitText}>{mode === 'sign_in' ? 'Sign in' : 'Sign up'}</Text>
            )}
          </Pressable>

          <Pressable onPress={() => setMode(mode === 'sign_in' ? 'sign_up' : 'sign_in')}>
            <Text style={styles.switchMode}>
              {mode === 'sign_in' ? "Don't have an account? Sign up" : 'Already have an account? Sign in'}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { flex: 1, justifyContent: 'center', padding: spacing.xl, gap: spacing.md },
  wordmark: { ...typeTokens.wordmark, color: colors.ink, textAlign: 'center', fontSize: 28 },
  subtitle: { color: colors.muted, textAlign: 'center', marginBottom: spacing.md },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: 15,
    color: colors.ink,
  },
  error: { color: '#b3453a', fontSize: 13, textAlign: 'center' },
  submit: {
    backgroundColor: colors.lavenderDeep,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  submitText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  switchMode: { color: colors.lavenderDeep, textAlign: 'center', marginTop: spacing.sm, fontSize: 13 },
});
