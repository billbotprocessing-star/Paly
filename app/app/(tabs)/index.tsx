import { Link, useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, FlatList, Pressable, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { useAuth } from '../../lib/auth-context';
import { listGoals } from '../../lib/goals-api';
import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';
import type { LearningGoal } from '../../lib/types';

export default function HomeScreen() {
  const { signOut } = useAuth();
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(() => {
    setLoading(true);
    listGoals()
      .then(setGoals)
      .finally(() => setLoading(false));
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <View style={styles.header}>
        <Text style={styles.wordmark}>Paly</Text>
        <Pressable onPress={signOut}>
          <Text style={styles.signOut}>Sign out</Text>
        </Pressable>
      </View>

      <FlatList
        data={goals}
        keyExtractor={(g) => g.id}
        contentContainerStyle={styles.list}
        refreshing={loading}
        onRefresh={load}
        ListHeaderComponent={
          <Link href="/new-goal" asChild>
            <Pressable style={styles.capture}>
              <Text style={styles.captureIcon}>+</Text>
              <Text style={styles.captureText}>Start a new goal — Exam or Explore</Text>
            </Pressable>
          </Link>
        }
        ListEmptyComponent={
          loading ? (
            <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.lavenderDeep} />
          ) : (
            <Text style={styles.empty}>No goals yet. Start one above to capture your first source.</Text>
          )
        }
        renderItem={({ item }) => (
          <Link href={{ pathname: '/goal/[id]', params: { id: item.id } }} asChild>
            <Pressable style={[styles.goalCard, item.mode === 'exam' ? styles.examCard : styles.exploreCard]}>
              <Text style={styles.goalTitle}>{item.title}</Text>
              {item.subject ? <Text style={styles.goalSubject}>{item.subject}</Text> : null}
              <View style={styles.pill}>
                <Text style={styles.pillText}>{item.mode === 'exam' ? 'exam mode' : 'explore mode'}</Text>
              </View>
            </Pressable>
          </Link>
        )}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  wordmark: { ...typeTokens.wordmark, color: colors.ink },
  signOut: { color: colors.muted, fontSize: 13 },
  list: { padding: spacing.xl, paddingTop: spacing.md, gap: spacing.md },
  capture: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.lavender,
    backgroundColor: '#fbf9ff',
    borderRadius: radii.xl,
    paddingVertical: spacing.xl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    marginBottom: spacing.md,
  },
  captureIcon: { fontSize: 28, color: colors.captureIcon, marginBottom: spacing.xs },
  captureText: { color: colors.captureText, fontSize: 15, textAlign: 'center' },
  empty: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl },
  goalCard: { padding: spacing.md + 2, borderRadius: radii.lg, gap: 4 },
  examCard: { backgroundColor: colors.peach },
  exploreCard: { backgroundColor: colors.mint },
  goalTitle: { ...typeTokens.scrapTitle, color: colors.ink },
  goalSubject: { color: colors.scrapPeachText, fontSize: 14 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.pillBg,
    marginTop: spacing.xs,
  },
  pillText: { ...typeTokens.pill, color: colors.pillText },
});
