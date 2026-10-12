import { useLocalSearchParams, useNavigation, useRouter } from 'expo-router';
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
  getMyUsage,
  listGenerationJobs,
  UsageLimitError,
  type AiUsage,
  listConcepts,
  listSources,
  listStudyItems,
  publishAllDrafts,
  updateStudyItem,
} from '../../lib/goals-api';
import { colors, radii, spacing, type as typeTokens } from '../../lib/theme';
import type { ConceptRow, LearningGoal, SourceRow, StudyItemRow } from '../../lib/types';

export default function GoalDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const navigation = useNavigation();
  const router = useRouter();
  const [publishingAll, setPublishingAll] = useState(false);

  const [goal, setGoal] = useState<LearningGoal | null>(null);
  const [sources, setSources] = useState<SourceRow[]>([]);
  const [concepts, setConcepts] = useState<ConceptRow[]>([]);
  const [items, setItems] = useState<StudyItemRow[]>([]);
  const [loading, setLoading] = useState(true);

  const [sourceTitle, setSourceTitle] = useState('');
  const [sourceText, setSourceText] = useState('');
  const [capturing, setCapturing] = useState(false);
  const [captureError, setCaptureError] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [usage, setUsage] = useState<AiUsage | null>(null);
  const [jobs, setJobs] = useState<Record<string, { status: string; error_code: string | null }>>({});
  const [retrying, setRetrying] = useState<string | null>(null);

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
      // Credits and job status are helpful extras; never block the screen on them.
      getMyUsage().then(setUsage).catch(() => setUsage(null));
      listGenerationJobs(s.map((x) => x.id)).then(setJobs).catch(() => setJobs({}));
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
    setNotice(null);
    setCapturing(true);
    let captured = false;
    try {
      const source = await captureTextSource(id, sourceTitle.trim() || 'Pasted text', sourceText.trim());
      captured = true;
      const result = await generateStudySet(source.id);
      if (result.truncated && result.usage) {
        setNotice(
          `This source was long, so cards were made from the first ~${result.usage.max_source_chars.toLocaleString()} characters (the ${result.usage.plan} plan limit). Capture the rest as a separate source.`
        );
      }
    } catch (err) {
      if (err instanceof UsageLimitError) setNotice(err.message);
      else setCaptureError(err instanceof Error ? err.message : 'Capture failed.');
    } finally {
      if (captured) {
        setSourceTitle('');
        setSourceText('');
        await load();
      }
      setCapturing(false);
    }
  }

  async function handleRetry(sourceId: string) {
    setRetrying(sourceId);
    setNotice(null);
    setCaptureError(null);
    try {
      await generateStudySet(sourceId);
    } catch (err) {
      if (err instanceof UsageLimitError) setNotice(err.message);
      else setCaptureError(err instanceof Error ? err.message : 'Generation failed.');
    } finally {
      await load();
      setRetrying(null);
    }
  }

  async function handlePublish(item: StudyItemRow) {
    const updated = await updateStudyItem(item.id, { status: 'published' });
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function handleDiscard(item: StudyItemRow) {
    const updated = await updateStudyItem(item.id, { status: 'archived' });
    setItems((prev) => prev.map((i) => (i.id === updated.id ? updated : i)));
  }

  async function handlePublishAll() {
    setPublishingAll(true);
    try {
      await publishAllDrafts(id);
      await load();
    } finally {
      setPublishingAll(false);
    }
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
          {usage ? (
            <Text style={styles.usage}>
              {Math.max(0, Math.min(usage.monthly_limit - usage.used_month, usage.daily_limit - usage.used_today))}{' '}
              AI {Math.min(usage.monthly_limit - usage.used_month, usage.daily_limit - usage.used_today) === 1 ? 'generation' : 'generations'} left
              {usage.daily_limit - usage.used_today < usage.monthly_limit - usage.used_month ? ' today' : ' this month'}
              {' · '}
              {usage.plan === 'pro' ? 'Pro' : 'Free'} plan · up to {usage.max_source_chars.toLocaleString()} characters per source
            </Text>
          ) : null}
          {captureError ? <Text style={styles.error}>{captureError}</Text> : null}
          {notice ? <Text style={styles.notice}>{notice}</Text> : null}
          <Pressable style={styles.submit} onPress={handleCapture} disabled={capturing}>
            {capturing ? (
              <ActivityIndicator color="#ffffff" />
            ) : (
              <Text style={styles.submitText}>
                {usage && Math.min(usage.monthly_limit - usage.used_month, usage.daily_limit - usage.used_today) <= 0
                  ? 'Capture (generate cards later)'
                  : 'Capture & generate study set'}
              </Text>
            )}
          </Pressable>
        </View>

        <Text style={styles.sectionLabel}>Sources ({sources.length})</Text>
        {sources.length === 0 ? (
          <Text style={styles.empty}>Nothing captured yet.</Text>
        ) : (
          sources.map((s) => {
            const job = jobs[s.id];
            const needsCards = !job || job.status === 'failed';
            const label = !job
              ? 'no cards yet'
              : job.status === 'failed'
                ? job.error_code?.startsWith('limit_reached')
                  ? 'over limit'
                  : 'generation failed'
                : job.status === 'succeeded'
                  ? 'cards ready'
                  : job.status;
            return (
              <View key={s.id} style={styles.sourceRow}>
                <Text style={[styles.sourceTitle, { flex: 1 }]}>{s.title}</Text>
                <View style={styles.pill}>
                  <Text style={styles.pillText}>{label}</Text>
                </View>
                {needsCards && s.status === 'ingested' ? (
                  <Pressable
                    onPress={() => handleRetry(s.id)}
                    disabled={retrying !== null}
                    accessibilityRole="button"
                    accessibilityLabel={`Generate cards for ${s.title}`}
                    hitSlop={8}
                    style={{ marginLeft: spacing.sm }}
                  >
                    {retrying === s.id ? (
                      <ActivityIndicator color={colors.lavenderDeep} />
                    ) : (
                      <Text style={styles.linkText}>Generate</Text>
                    )}
                  </Pressable>
                ) : null}
              </View>
            );
          })
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Draft study items ({draftItems.length})</Text>
          {draftItems.length > 1 ? (
            <Pressable onPress={handlePublishAll} disabled={publishingAll} accessibilityRole="button" hitSlop={8}>
              {publishingAll ? (
                <ActivityIndicator color={colors.lavenderDeep} />
              ) : (
                <Text style={styles.linkText}>Publish all</Text>
              )}
            </Pressable>
          ) : null}
        </View>
        {draftItems.length === 0 ? (
          <Text style={styles.empty}>Generated items will show up here to review before publishing.</Text>
        ) : (
          <>
            <Text style={styles.empty}>Check each card, fix anything that's off, then publish it to start learning it.</Text>
            {draftItems.map((item) => (
              <DraftItemCard
                key={item.id}
                item={item}
                onPublish={() => handlePublish(item)}
                onDiscard={() => handleDiscard(item)}
              />
            ))}
          </>
        )}

        <View style={styles.sectionHeader}>
          <Text style={styles.sectionLabel}>Published items ({publishedItems.length})</Text>
        </View>
        {publishedItems.length > 0 ? (
          <Pressable
            style={styles.submit}
            onPress={() => router.push({ pathname: '/session', params: { minutes: '10', goalId: id } })}
            accessibilityRole="button"
          >
            <Text style={styles.submitText}>Study this goal</Text>
          </Pressable>
        ) : null}
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

const TYPE_LABEL: Record<StudyItemRow['item_type'], string> = {
  short_answer: 'Quick answer',
  cloze: 'Fill the blank',
  explain_back: 'Explain it',
};

function DraftItemCard({
  item,
  onPublish,
  onDiscard,
}: {
  item: StudyItemRow;
  onPublish: () => void;
  onDiscard: () => void;
}) {
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
        <Text style={styles.pillText}>{TYPE_LABEL[item.item_type]}</Text>
      </View>
      <TextInput style={styles.draftInput} value={prompt} onChangeText={setPrompt} multiline />
      <Text style={styles.answerLabel}>Answer</Text>
      <TextInput style={styles.draftInput} value={answer} onChangeText={setAnswer} multiline />
      <View style={styles.draftActions}>
        <Pressable style={styles.discardButton} onPress={onDiscard} disabled={saving} accessibilityRole="button">
          <Text style={styles.discardText}>Discard</Text>
        </Pressable>
        <Pressable style={[styles.publishButton, { flex: 1 }]} onPress={handleSaveAndPublish} disabled={saving} accessibilityRole="button">
          {saving ? <ActivityIndicator color="#ffffff" /> : <Text style={styles.submitText}>{dirty ? 'Save & publish' : 'Publish'}</Text>}
        </Pressable>
      </View>
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
  sectionHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end' },
  linkText: { color: colors.lavenderDeep, fontWeight: '700', fontSize: 14 },
  draftActions: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.xs },
  discardButton: {
    borderRadius: radii.md,
    paddingVertical: spacing.sm,
    paddingHorizontal: spacing.lg,
    alignItems: 'center',
    backgroundColor: 'rgba(255,255,255,0.7)',
  },
  discardText: { color: colors.scrapPeachText, fontWeight: '700', fontSize: 14 },
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
  notice: { color: colors.captureText, fontSize: 13, lineHeight: 18, backgroundColor: colors.lavenderSoft, padding: spacing.sm, borderRadius: radii.sm },
  usage: { color: colors.muted, fontSize: 12 },
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
