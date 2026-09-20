import { Link } from 'expo-router';
import { Image, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ScrapCard } from '../../components/ScrapCard';
import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';
import { useScraps } from '../../lib/scraps-context';

export default function HomeScreen() {
  const { scraps, loaded } = useScraps();
  const openScraps = scraps.filter((s) => s.status !== 'ready');

  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView
        contentContainerStyle={styles.screen}
        showsVerticalScrollIndicator={false}
      >
        <Text style={styles.wordmark}>Paly</Text>

        <View style={styles.buddy}>
          <Image
            source={require('../../assets/mascot.png')}
            style={styles.mascot}
            accessibilityLabel="Paly, a soft cloud study buddy"
          />
          <Text style={styles.invite}>Got something confusing? Drop it here.</Text>
        </View>

        <Link href="/new-scrap" asChild>
          <Pressable style={styles.capture} accessibilityRole="button" accessibilityLabel="Capture a study scrap">
            <Text style={styles.captureIcon}>📷</Text>
            <Text style={styles.captureText}>Photo, paste, or type a question…</Text>
          </Pressable>
        </Link>

        <Text style={styles.sectionLabel}>Open scraps</Text>
        <View style={{ gap: spacing.md }}>
          {loaded && openScraps.length === 0 ? (
            <Text style={styles.empty}>Nothing open right now — drop a scrap above.</Text>
          ) : (
            openScraps.map((scrap) => <ScrapCard key={scrap.id} scrap={scrap} />)
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: {
    padding: spacing.xl,
    paddingBottom: 120,
    gap: spacing.lg,
  },
  wordmark: { ...typeTokens.wordmark, color: colors.ink, textAlign: 'center' },
  buddy: { alignItems: 'center', gap: spacing.sm, marginTop: spacing.xs },
  mascot: { width: 148, height: 148, resizeMode: 'contain' },
  invite: { ...typeTokens.invite, color: colors.muted, textAlign: 'center' },
  capture: {
    borderWidth: 2,
    borderStyle: 'dashed',
    borderColor: colors.lavender,
    backgroundColor: '#fbf9ff',
    borderRadius: radii.xl,
    paddingVertical: spacing.xxl,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
  },
  captureIcon: { fontSize: 28, marginBottom: spacing.sm, color: colors.captureIcon },
  captureText: { color: colors.captureText, fontSize: 15 },
  sectionLabel: { ...typeTokens.sectionLabel, color: colors.ink, marginTop: spacing.xs },
  empty: { color: colors.muted, fontSize: 14 },
});
