import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScrapCard } from '../../components/ScrapCard';
import { colors, spacing, type as typeTokens } from '../../lib/theme';
import { useScraps } from '../../lib/scraps-context';

export default function StudyScreen() {
  const { scraps, loaded } = useScraps();
  const ready = scraps.filter((s) => s.status === 'ready');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Study</Text>
        <Text style={styles.subtitle}>Study cards you've shipped, ready to review.</Text>

        <View style={{ gap: spacing.md, marginTop: spacing.md }}>
          {loaded && ready.length === 0 ? (
            <Text style={styles.empty}>Nothing shipped yet. Clarify a scrap and tap Ship.</Text>
          ) : (
            ready.map((scrap) => <ScrapCard key={scrap.id} scrap={scrap} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.xl, paddingBottom: 120 },
  title: { ...typeTokens.wordmark, color: colors.ink },
  subtitle: { color: colors.muted, marginTop: spacing.xs, fontSize: 14 },
  empty: { color: colors.muted, fontSize: 14 },
});
