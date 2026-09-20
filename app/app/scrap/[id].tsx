import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import {
  FlatList,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';
import { useScraps } from '../../lib/scraps-context';
import type { ChatMessage } from '../../lib/types';

export default function ClarifyScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const { getScrap, sendMessage, shipScrap } = useScraps();
  const scrap = getScrap(id);
  const [draft, setDraft] = useState('');
  const listRef = useRef<FlatList<ChatMessage>>(null);

  useLayoutEffect(() => {
    navigation.setOptions({ title: scrap?.title ?? 'Clarify' });
  }, [navigation, scrap?.title]);

  useEffect(() => {
    listRef.current?.scrollToEnd({ animated: true });
  }, [scrap?.messages.length]);

  if (!scrap) {
    return (
      <SafeAreaView style={styles.safe}>
        <View style={styles.missing}>
          <Text style={{ color: colors.muted }}>This scrap is gone.</Text>
        </View>
      </SafeAreaView>
    );
  }

  const isReady = scrap.status === 'ready';
  const scrapId = scrap.id;

  function handleSend() {
    if (!draft.trim()) return;
    sendMessage(scrapId, draft);
    setDraft('');
  }

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <KeyboardAvoidingView
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        style={{ flex: 1 }}
        keyboardVerticalOffset={90}
      >
        <View style={styles.header}>
          <Text style={styles.subtitle}>{scrap.subtitle}</Text>
        </View>

        <FlatList
          ref={listRef}
          data={scrap.messages}
          keyExtractor={(m) => m.id}
          contentContainerStyle={styles.messages}
          ListEmptyComponent={
            <Text style={styles.hint}>
              Tell Paly what's confusing about this — send a message to start.
            </Text>
          }
          renderItem={({ item }) => (
            <View
              style={[
                styles.bubble,
                item.role === 'buddy' ? styles.bubbleBuddy : styles.bubbleStudent,
              ]}
            >
              <Text style={item.role === 'buddy' ? styles.bubbleTextBuddy : styles.bubbleTextStudent}>
                {item.text}
              </Text>
            </View>
          )}
        />

        {isReady && scrap.studyCard ? (
          <View style={styles.studyCard}>
            <Text style={styles.studyCardTitle}>📘 {scrap.studyCard.summary}</Text>
            {scrap.studyCard.points.map((p, i) => (
              <Text key={i} style={styles.studyCardPoint}>
                • {p}
              </Text>
            ))}
          </View>
        ) : null}

        <View style={styles.composer}>
          <TextInput
            style={styles.input}
            placeholder="Type your question…"
            placeholderTextColor={colors.muted}
            value={draft}
            onChangeText={setDraft}
            onSubmitEditing={handleSend}
            returnKeyType="send"
          />
          <Pressable style={styles.sendButton} onPress={handleSend}>
            <Text style={styles.sendButtonText}>Send</Text>
          </Pressable>
        </View>

        <Pressable
          style={[styles.shipButton, isReady && styles.shipButtonDone]}
          onPress={() => shipScrap(scrapId)}
          disabled={isReady}
        >
          <Text style={[styles.shipButtonText, isReady && styles.shipButtonTextDone]}>
            {isReady ? '✓ Shipped — see it in Study' : 'Ship this study card'}
          </Text>
        </Pressable>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  missing: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  header: { paddingHorizontal: spacing.xl, paddingTop: spacing.sm, paddingBottom: spacing.xs },
  subtitle: { color: colors.muted, fontSize: 14 },
  messages: { padding: spacing.xl, gap: spacing.sm, flexGrow: 1 },
  hint: { color: colors.muted, textAlign: 'center', marginTop: spacing.xl, fontSize: 14 },
  bubble: { maxWidth: '85%', padding: spacing.md, borderRadius: radii.lg },
  bubbleBuddy: { backgroundColor: colors.lavenderSoft, alignSelf: 'flex-start' },
  bubbleStudent: { backgroundColor: colors.lavenderDeep, alignSelf: 'flex-end' },
  bubbleTextBuddy: { color: colors.ink, fontSize: 15 },
  bubbleTextStudent: { color: '#ffffff', fontSize: 15 },
  studyCard: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.sm,
    backgroundColor: colors.mint,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: 4,
  },
  studyCardTitle: { ...typeTokens.scrapTitle, color: colors.ink, marginBottom: 4 },
  studyCardPoint: { color: colors.scrapPeachText, fontSize: 14 },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    paddingHorizontal: spacing.xl,
    paddingBottom: spacing.sm,
  },
  input: {
    flex: 1,
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm + 2,
    fontSize: 15,
    color: colors.ink,
  },
  sendButton: {
    backgroundColor: colors.lavenderDeep,
    borderRadius: radii.md,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    justifyContent: 'center',
  },
  sendButtonText: { color: '#ffffff', fontWeight: '700' },
  shipButton: {
    marginHorizontal: spacing.xl,
    marginBottom: spacing.md,
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.md,
    alignItems: 'center',
  },
  shipButtonDone: { backgroundColor: colors.mint },
  shipButtonText: { color: '#ffffff', fontWeight: '700', fontSize: 15 },
  shipButtonTextDone: { color: colors.ink },
});
