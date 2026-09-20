import { Image, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';

export default function BuddyScreen() {
  return (
    <SafeAreaView style={styles.safe} edges={['top']}>
      <ScrollView contentContainerStyle={styles.screen} showsVerticalScrollIndicator={false}>
        <Text style={styles.title}>Buddy</Text>
        <View style={styles.card}>
          <Image source={require('../../assets/mascot.png')} style={styles.mascot} />
          <Text style={styles.name}>Paly</Text>
          <Text style={styles.body}>
            A misty cloud-friend made of pale bytes. No streaks, no shame scoreboards —
            just a calm place to work through whatever's confusing.
          </Text>
        </View>
        <Text style={styles.note}>
          Open a scrap from Home and tap it to start clarifying together.
        </Text>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.xl, paddingBottom: 120, gap: spacing.lg },
  title: { ...typeTokens.wordmark, color: colors.ink },
  card: {
    backgroundColor: colors.surface,
    borderRadius: radii.xl,
    padding: spacing.xl,
    alignItems: 'center',
    gap: spacing.sm,
  },
  mascot: { width: 120, height: 120, resizeMode: 'contain' },
  name: { ...typeTokens.scrapTitle, fontSize: 18, color: colors.ink },
  body: { color: colors.muted, textAlign: 'center', lineHeight: 20 },
  note: { color: colors.muted, textAlign: 'center', fontSize: 13 },
});
