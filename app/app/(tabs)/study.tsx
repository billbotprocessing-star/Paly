// Study tab: today's adaptive queue (Paly MVP Spec, capability 5).
// One next action — start a session sized to the time you have — plus a
// per-goal breakdown for when you want to focus on one subject.
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatWhen } from '../../lib/format';
import { listGoals } from '../../lib/goals-api';
import { SECONDS_PER_ITEM } from '../../lib/scheduler';
import { getTodaySummary, type TodaySummary } from '../../lib/study-api';
import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';
import type { LearningGoal } from '../../lib/types';

const LENGTHS = [2, 5, 10] as const;

export default function StudyScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<TodaySummary | null>(null);
  const [goals, setGoals] = useState<LearningGoal[]>([]);
  const [minutes, setMinutes] = useState<(typeof LENGTHS)[number]>(5);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [s, g] = await Promise.all([getTodaySummary(), listGoals()]);
      setSummary(s);
      setGoals(g.filter((goal) => goal.status === 'active'));
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not load your reviews.');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  const total = summary ? summary.dueCount + summary.newCount : 0;
  const estMinutes = Math.max(1, Math.round((total * SECONDS_PER_ITEM) / 60));

  function start(goalId?: string) {
    router.push({ pathname: '/session', params: goalId ? { minutes: String(minutes), goalId } : { minutes: String(minutes) } });
  }

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.screen}
        refreshControl={<RefreshControl refreshing={loading && !!summary} onRefresh={load} />}
      >
        <Text style={styles.title}>Study</Text>

        {loading && !summary ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.lavenderDeep} />
        ) : error ? (
          <Text style={styles.error}>{error}</Text>
        ) : !summary || summary.totalPublished === 0 ? (
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>Nothing to review yet</Text>
            <Text style={styles.heroBody}>
              Open a goal, capture some material, and publish the cards you want to learn. They'll show up here.
            </Text>
          </View>
        ) : total === 0 ? (
          <View style={styles.hero}>
            <Text style={styles.heroTitle}>All caught up 🎉</Text>
            <Text style={styles.heroBody}>
              {summary.nextDueAt
                ? `Your next review is ${formatWhen(summary.nextDueAt)}.`
                : 'Publish more cards to keep learning.'}
            </Text>
          </View>
        ) : (
          <View style={styles.hero}>
            <Text style={styles.heroKicker}>Today</Text>
            <Text style={styles.heroTitle}>
              {summary.dueCount > 0 ? `${summary.dueCount} due` : ''}
              {summary.dueCount > 0 && summary.newCount > 0 ? ' · ' : ''}
              {summary.newCount > 0 ? `${summary.newCount} new` : ''}
            </Text>
            <Text style={styles.heroBody}>About {estMinutes} min for everything. How long do you have?</Text>

            <View style={styles.lengths} accessibilityRole="radiogroup">
              {LENGTHS.map((m) => (
                <Pressable
                  key={m}
                  onPress={() => setMinutes(m)}
                  style={[styles.length, minutes === m && styles.lengthOn]}
                  accessibilityRole="radio"
                  accessibilityState={{ selected: minutes === m }}
                >
                  <Text style={[styles.lengthText, minutes === m && styles.lengthTextOn]}>
                    {minutes === m ? '✓ ' : ''}
                    {m} min
                  </Text>
                </Pressable>
              ))}
            </View>

            <Pressable style={styles.primary} onPress={() => start()} accessibilityRole="button">
              <Text style={styles.primaryText}>Start studying</Text>
            </Pressable>
          </View>
        )}

        {summary && goals.length > 0 ? (
          <>
            <Text style={styles.sectionLabel}>By goal</Text>
            {goals.map((goal) => {
              const counts = summary.byGoal[goal.id] ?? { due: 0, fresh: 0 };
              const any = counts.due + counts.fresh > 0;
              return (
                <View key={goal.id} style={[styles.goalRow, goal.mode === 'exam' ? styles.exam : styles.explore]}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.goalTitle}>{goal.title}</Text>
                    <Text style={styles.goalMeta}>
                      {any
                        ? [counts.due ? `${counts.due} due` : '', counts.fresh ? `${counts.fresh} new` : '']
                            .filter(Boolean)
                            .join(' · ')
                        : 'Nothing due'}
                      {goal.mode === 'exam' && goal.exam_at ? ` · exam ${formatWhen(new Date(goal.exam_at))}` : ''}
                    </Text>
                  </View>
                  {any ? (
                    <Pressable
                      style={styles.goalStart}
                      onPress={() => start(goal.id)}
                      accessibilityRole="button"
                      accessibilityLabel={`Study ${goal.title}`}
                    >
                      <Text style={styles.goalStartText}>Study</Text>
                    </Pressable>
                  ) : null}
                </View>
              );
            })}
          </>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.xl, paddingBottom: 110, gap: spacing.md },
  title: { ...typeTokens.wordmark, color: colors.ink },
  error: { color: '#a14b4b', fontSize: 14, marginTop: spacing.lg },
  hero: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    borderWidth: 1,
    borderColor: colors.line,
    gap: spacing.sm,
  },
  heroKicker: { color: colors.lavenderDeep, fontSize: 13, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.5 },
  heroTitle: { fontSize: 26, fontWeight: '700', color: colors.ink, letterSpacing: -0.4 },
  heroBody: { color: colors.muted, fontSize: 15, lineHeight: 21 },
  lengths: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  length: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: 'center',
  },
  lengthOn: { backgroundColor: colors.lavenderSoft, borderColor: colors.lavenderDeep },
  lengthText: { fontSize: 14, fontWeight: '600', color: colors.ink },
  lengthTextOn: { color: colors.lavenderDeep },
  primary: {
    backgroundColor: colors.lavenderDeep,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    marginTop: spacing.sm,
  },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  sectionLabel: { ...typeTokens.sectionLabel, color: colors.ink, marginTop: spacing.md },
  goalRow: { flexDirection: 'row', alignItems: 'center', padding: spacing.md + 2, borderRadius: radii.lg, gap: spacing.md },
  exam: { backgroundColor: colors.peach },
  explore: { backgroundColor: colors.mint },
  goalTitle: { ...typeTokens.scrapTitle, color: colors.ink },
  goalMeta: { color: colors.scrapPeachText, fontSize: 13, marginTop: 2 },
  goalStart: { backgroundColor: colors.pillBg, paddingHorizontal: 16, paddingVertical: 9, borderRadius: radii.pill },
  goalStartText: { color: colors.ink, fontWeight: '700', fontSize: 14 },
});
