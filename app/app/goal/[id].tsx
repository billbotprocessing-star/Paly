import { useLocalSearchParams, useNavigation } from 'expo-router';
import { useCallback, useLayoutEffect, useState } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect } from 'expo-router';

import {
  captureTextSource,
  generateStudySet,
  getGoal,
  listConcepts,
  listSources,
  listStudyItems,
  updateStudyItem,
} from '../../lib/goals-api';
import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';
import type { ConceptRow, LearningGoal, SourceRow, StudyItemRow } from '../../lib/types';

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();

  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [items, setItems] = useState<StudyItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const [g, s, c, i] = await Promise.all([
        getGoal(id),
        listSources(id),
        listConcepts(id),
        listStudyItems(id),
      ]);
      setGoal(g);
      setSources(s);
      setConcepts(c);
      setItems(i);
    } finally {
      setLoading(false);
    }
  }, [id]);

  useFocusEffect(
    useCallback(() => {
      load();
    }, [load])
  );

  useLayoutEffect(() => {
    navigation.setOptions({ title: goal?.title ?? 'Goal' });
  }, [navigation, goal?.title]);

  async function handleCapture() {
    if (!sourceText.trim()) {
      setCaptureError('Paste or type something to capture first.');
      return;
    }
    setCaptureError(null);
    setCapturing(true);
    try {
      const source = await captureTextSource(id, sourceTitle.trim() || 'Pasted text', sourceText.trim());
      await generateStudySet(source.id);
      setSourceTitle('');
      setSourceText('');
      await load();
    } catch (err) {
      setCaptureError(err instanceof Error ? err.message : 'Capture failed.');
    } finally {
      setCapturing(false);
    }
  }

  async function handlePublish(item: StudyItemRow) {
    const updated = await updateStudyItem(item.id, { status: 'published' });
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  if (loading && !goal) {
    return (
      <SafeAreaView style={[styles.safe, { alignItems: 'center', justifyContent: 'center' }]}>
        <ActivityIndicator color={colors.lavenderDeep} />
      </SafeAreaView>
    );
  }

  const draftItems = items.filter((i) => i.status === 'draft');
  const publishedItems = items.filter((i) => i.status === 'published');

  return (
    <SafeAreaView style={styles.safe} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.screen}>
        <View style={styles.captureBox}>
          <Text style={styles.sectionLabel}>Capture</Text>
          <TextInput
            style={styles.titleInput}
            placeholder="What is this source? (e.g. Ch.4 notes)"
            placeholderTextColor={colors.muted}
            value={sourceTitle}
            onChangeText={setSourceTitle}
          />
          <TextInput
            style={styles.textArea}
            placeholder="Paste text you want to study…"
            placeholderTextColor={colors.muted}
            value={sourceText}
            onChangeText={setSourceText}
            multiline
            textAlignVertical="top"
          />
          {captureError ? <Text style={styles.error}>{captureError}</Text> : null}
          <Pressable style={styles.submit} onPress={handleCapture} disabled={capturing}>
            {capturing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitText}>Capture &amp; generate study set</Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Sources ({sources.length})</Text>
        {sources.length === 0 ? (
          <Text style={styles.empty}>Nothing captured yet.</Text>
        ) : (
          sources.map((s) => (
            <View key={s.id} style={styles.sourceRow}>
              <Text style={styles.sourceTitle}>{s.title}</Text>
              <View style={styles.pill}>
                <Text style={styles.pillText}>{s.status}</Text>
              </View>
            </View>
          ))
        )}

        <Text style={styles.sectionLabel}>Draft study items ({draftItems.length})</Text>
        {draftItems.length === 0 ? (
          <Text style={styles.empty}>Generated items will show up here to review before publishing.</Text>
        ) : (
          draftItems.map((item) => (
            <DraftItemCard key={item.id} item={item} onPublish={() => handlePublish(item)} />
          ))
        )}

        <Text style={styles.sectionLabel}>Published items ({publishedItems.length})</Text>
        {publishedItems.length === 0 ? (
          <Text style={styles.empty}>Publish a draft item above to add it to your study set.</Text>
        ) : (
          publishedItems.map((item) => (
            <View key={item.id} style={styles.publishedRow}>
              <Text style={styles.itemPrompt}>{item.prompt}</Text>
            </View>
          ))
        )}

        <Text style={styles.sectionLabel}>Concepts ({concepts.length})</Text>
        {concepts.map((c) => (
          <View key={c.id} style={styles.conceptRow}>
            <Text style={styles.itemPrompt}>{c.name}</Text>
            <Text style={styles.conceptExplanation}>{c.explanation}</Text>
          </View>
        ))}
      </ScrollView>
    </SafeAreaView>
  );
}

function DraftItemCard({ item, onPublish }: { item: StudyItemRow; onPublish: () => void }) {
  const [prompt, setPrompt] = useState(item.prompt);
  const [answer, setAnswer] = useState(item.answer);
  const [saving, setSaving] = useState(false);
  const dirty = prompt !== item.prompt || answer !== item.answer;

  async function handleSaveAndPublish() {
    setSaving(true);
    try {
      if (dirty) {
        await updateStudyItem(item.id, { prompt, answer });
      }
      onPublish();
    } finally {
      setSaving(false);
    }
  }

  return (
    <View style={styles.draftCard}>
      <View style={styles.pill}>
        <Text style={styles.pillText}>{item.item_type}</Text>
      </View>
      <TextInput style={styles.draftInput} value={prompt} onChangeText={setPrompt} multiline />
      <Text style={styles.answerLabel}>Answer</Text>
      <TextInput style={styles.draftInput} value={answer} onChangeText={setAnswer} multiline />
      <Pressable style={styles.publishButton} onPress={handleSaveAndPublish} disabled={saving}>
        {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>Publish</Text>}
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  screen: { padding: spacing.xl, gap: spacing.sm, paddingBottom: 60 },
  captureBox: {
    backgroundColor: colors.surface,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  sectionLabel: { ...typeTokens.sectionLabel, color: colors.ink, marginTop: spacing.md },
  titleInput: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  textArea: {
    backgroundColor: colors.bg,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    minHeight: 100,
    fontSize: 14,
    color: colors.ink,
  },
  error: { color: '#b3453a', fontSize: 13 },
  submit: {
    backgroundColor: colors.lavenderDeep,
    borderRadius: radii.md,
    paddingVertical: spacing.sm + 2,
    alignItems: 'center',
  },
  submitText: { color: '#ffffff', fontWeight: '700', fontSize: 14 },
  empty: { color: colors.muted, fontSize: 13 },
  sourceRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm + 2,
  },
  sourceTitle: { color: colors.ink, fontSize: 14 },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.pillBg,
  },
  pillText: { ...typeTokens.pill, color: colors.pillText },
  draftCard: { backgroundColor: colors.peach, borderRadius: radii.lg, padding: spacing.md, gap: spacing.xs },
  draftInput: {
    backgroundColor: 'rgba(255,255,255,0.7)',
    borderRadius: radii.sm,
    padding: spacing.sm,
    fontSize: 14,
    color: colors.ink,
  },
  answerLabel: { color: colors.scrapPeachText, fontSize: 12, fontWeight: '600' },
  publishButton: {
    backgroundColor: colors.ink,
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    alignItems: 'center',
    marginTop: spacing.xs,
  },
  publishedRow: { backgroundColor: colors.mint, borderRadius: radii.md, padding: spacing.sm + 2 },
  itemPrompt: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  conceptRow: { backgroundColor: colors.surface, borderRadius: radii.md, padding: spacing.sm + 2, gap: 2 },
  conceptExplanation: { color: colors.scrapPeachText, fontSize: 13 },
});
