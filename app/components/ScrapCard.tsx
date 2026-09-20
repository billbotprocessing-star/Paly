import { Link } from 'expo-router';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing, type as typeTokens } from '../lib/theme';
import type { Scrap } from '../lib/types';

const STATUS_LABEL: Record<Scrap['status'], string> = {
  pale: 'new',
  clarifying: 'clarify',
  ready: 'ready to ship',
};

export function ScrapCard({ scrap }: { scrap: Scrap }) {
  const bg = scrap.accent === 'peach' ? colors.peach : colors.mint;

  return (
    <Link href={{ pathname: '/scrap/[id]', params: { id: scrap.id } }} asChild>
      <Pressable style={StyleSheet.flatten([styles.card, { backgroundColor: bg }])}>
        <View style={styles.thumb}>
          <Text style={{ fontSize: 20 }}>📄</Text>
        </View>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>{scrap.title}</Text>
          <Text style={styles.subtitle}>{scrap.subtitle}</Text>
          <View style={styles.pill}>
            <Text style={styles.pillText}>{STATUS_LABEL[scrap.status]}</Text>
          </View>
        </View>
      </Pressable>
    </Link>
  );
}

const styles = StyleSheet.create({
  card: {
    flexDirection: 'row',
    gap: spacing.md,
    padding: spacing.md + 2,
    borderRadius: radii.lg,
    alignItems: 'flex-start',
  },
  thumb: {
    width: 48,
    height: 48,
    borderRadius: radii.sm,
    backgroundColor: colors.scrapThumb,
    alignItems: 'center',
    justifyContent: 'center',
  },
  title: { ...typeTokens.scrapTitle, color: colors.ink, marginBottom: 2 },
  subtitle: { ...typeTokens.scrapSubtitle, color: colors.scrapPeachText, marginBottom: spacing.sm },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.pillBg,
  },
  pillText: { ...typeTokens.pill, color: colors.pillText },
});
