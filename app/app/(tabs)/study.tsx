import { useFocusEffect } from 'expo-router';
import { useCallback, useState } from 'react';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { listGoals, listStudyItems } from '../../lib/goals-api';
import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';
import type { LearningGoal, StudyItemRow } from '../../lib/types';

export default function StudyScreen() {
  const [loading, setLoading] = useState(true);
  const [groups, setGroups] = useState<{ goal: LearningGoal; items: StudyItemRow[] }[]>([]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const goals = await listGoals();
      const withItems = await Promise.all(
        goals.map(async (goal) => ({
          goal,
          items: (await listStudyItems(goal.id)).filter((i) => i.status === 'published'),
        }))
      );
      setGroups(withItems.filter((g) => g.items.length > 0));
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.screen}>
        <Text style={styles.title}>Study</Text>
        <Text style={styles.subtitle}>
          Published items across your goals. The adaptive review queue and scheduling land in the next
          milestone — for now this is everything you've confirmed is ready.
        </Text>

        {loading ? (
          <ActivityIndicator style={{ marginTop: spacing.xl }} color={colors.lavenderDeep} />
        ) : groups.length === 0 ? (
          <Text style={styles.empty}>Nothing published yet. Publish a draft item from a goal to see it here.</Text>
        ) : (
          groups.map(({ goal, items }) => (
            <View key={goal.id} style={{ gap: spacing.sm, marginTop: spacing.md }}>
              <Text style={styles.goalTitle}>{goal.title}</Text>
              {items.map((item) => (
                <View key={item.id} style={styles.itemCard}>
                  <Text style={styles.itemPrompt}>{item.prompt}</Text>
                </View>
              ))}
            </View>
          ))
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.xl, paddingBottom: 60 },
  title: { ...typeTokens.wordmark, color: colors.ink },
  subtitle: { color: colors.muted, marginTop: spacing.xs, fontSize: 13, lineHeight: 18 },
  empty: { color: colors.muted, fontSize: 14, marginTop: spacing.lg },
  goalTitle: { ...typeTokens.sectionLabel, color: colors.ink },
  itemCard: { backgroundColor: colors.mint, borderRadius: radii.md, padding: spacing.sm + 2 },
  itemPrompt: { color: colors.ink, fontSize: 14 },
});
