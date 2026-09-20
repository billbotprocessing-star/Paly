import { router } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { createGoal } from '../lib/goals-api';
import { colors, radii, spacing, type as typeTokens } from '../lib/theme';
import type { GoalMode } from '../lib/types';

export default function NewGoalScreen() {
  const [mode, setMode] = useState<GoalMode>('explore');
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState('');
  const [examAt, setExamAt] = useState('');
  const [cadence, setCadence] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  async function handleCreate() {
    if (!title.trim()) {
      setError('Give this goal a title.');
      return;
    }
    setError(null);
    setSubmitting(true);
    try {
      const goal = await createGoal({
        mode,
        title: title.trim(),
        subject: subject.trim() || undefined,
        examAt: mode === 'exam' && examAt.trim() ? new Date(examAt.trim()).toISOString() : null,
        cadence: cadence.trim() || undefined,
      });
      router.replace({ pathname: '/goal/[id]', params: { id: goal.id } });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not create goal.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.screen}>
          <View style={styles.modeRow}>
            <ModeButton
              label="Exam"
              sublabel="Deadline-driven"
              active={mode === 'exam'}
              onPress={() => setMode('exam')}
            />
            <ModeButton
              label="Explore"
              sublabel="Curiosity-driven"
              active={mode === 'explore'}
              onPress={() => setMode('explore')}
            />
          </View>

          <TextInput
            style={styles.input}
            placeholder="Title (e.g. Bio final, Neural networks)"
            placeholderTextColor={colors.muted}
            value={title}
            onChangeText={setTitle}
          />
          <TextInput
            style={styles.input}
            placeholder="Subject (optional)"
            placeholderTextColor={colors.muted}
            value={subject}
            onChangeText={setSubject}
          />
          {mode === 'exam' ? (
            <TextInput
              style={styles.input}
              placeholder="Exam date (YYYY-MM-DD)"
              placeholderTextColor={colors.muted}
              value={examAt}
              onChangeText={setExamAt}
            />
          ) : null}
          <TextInput
            style={styles.input}
            placeholder="Cadence (e.g. daily, 3x/week)"
            placeholderTextColor={colors.muted}
            value={cadence}
            onChangeText={setCadence}
          />

          {error ? <Text style={styles.error}>{error}</Text> : null}

          <Pressable style={styles.submit} onPress={handleCreate} disabled={submitting}>
            {submitting ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Create goal</Text>}
          </Pressable>
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

function ModeButton({
  label,
  sublabel,
  active,
  onPress,
}: {
  label: string;
  sublabel: string;
  active: boolean;
  onPress: () => void;
}) {
  return (
    <Pressable style={[styles.modeButton, active && styles.modeButtonActive]} onPress={onPress}>
      <Text style={[styles.modeLabel, active && styles.modeLabelActive]}>{label}</Text>
      <Text style={styles.modeSublabel}>{sublabel}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.xl, gap: spacing.md },
  modeRow: { flexDirection: 'row', gap: spacing.sm },
  modeButton: {
    flex: 1,
    padding: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  modeButtonActive: { backgroundColor: colors.lavenderSoft, borderColor: colors.lavender },
  modeLabel: { ...typeTokens.scrapTitle, color: colors.ink },
  modeLabelActive: { color: colors.lavenderDeep },
  modeSublabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
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
});
