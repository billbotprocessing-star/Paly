// Study session (Paly MVP Spec, capability 4 "Active recall").
// Recall before reveal: the answer stays hidden until the learner attempts it
// or taps "I don't know". Every rating writes an immutable review and moves
// the item's schedule. "Again" brings the card back later in the same sitting.
import * as Haptics from 'expo-haptics';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { formatWhen } from '../lib/format';
import { previewLabel, type Rating } from '../lib/scheduler';
import { endSession, getQueue, recordAnswer, startSession, type QueueItem } from '../lib/study-api';
import { colors, radii, spacing, type as typeTokens } from '../lib/theme';

const RATINGS: { rating: Rating; label: string; hint: string; bg: string }[] = [
  { rating: 'again', label: 'Again', hint: "Didn't know it", bg: '#f6d6d6' },
  { rating: 'hard', label: 'Hard', hint: 'Got it, with effort', bg: colors.peach },
  { rating: 'good', label: 'Good', hint: 'Knew it', bg: colors.mint },
  { rating: 'easy', label: 'Easy', hint: 'Instant', bg: colors.lavenderSoft },
];

const CONFIDENCE: { value: 1 | 2 | 3; label: string }[] = [
  { value: 1, label: 'Guessing' },
  { value: 2, label: 'Unsure' },
  { value: 3, label: 'Sure' },
];

const TYPE_LABEL: Record<QueueItem['itemType'], string> = {
  short_answer: 'Quick answer',
  cloze: 'Fill the blank',
  explain_back: 'Explain it',
};

const MAX_RELEARN_PER_ITEM = 2;

interface Tally {
  again: number;
  hard: number;
  good: number;
  easy: number;
  newLearned: number;
  nextDue: Date | null;
}

const normalize = (s: string) => s.toLowerCase().replace(/[^\p{L}\p{N}]+/gu, ' ').trim();

export default function SessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ minutes?: string; goalId?: string }>();
  const minutes = Math.max(1, Number(params.minutes) || 5);
  const goalId = params.goalId || undefined;

  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [queue, setQueue] = useState<QueueItem[]>([]);
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  const [gaveUp, setGaveUp] = useState(false);
  const [answerText, setAnswerText] = useState('');
  const [confidence, setConfidence] = useState<1 | 2 | 3 | null>(null);
  const [saving, setSaving] = useState(false);
  const [done, setDone] = useState(false);
  const [tally, setTally] = useState<Tally>({ again: 0, hard: 0, good: 0, easy: 0, newLearned: 0, nextDue: null });

  const shownAt = useRef(Date.now());
  const answeredAt = useRef(0);
  const relearnCount = useRef<Record<string, number>>({});
  const uniqueTotal = useRef(0);
  // Per card: its last rating this sitting, and whether it was ever missed.
  const finalRating = useRef<Record<string, Rating>>({});
  const missed = useRef<Set<string>>(new Set());

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const items = await getQueue(minutes, goalId);
        if (cancelled) return;
        if (items.length === 0) {
          setQueue([]);
          return;
        }
        const session = await startSession(minutes, goalId);
        if (cancelled) return;
        uniqueTotal.current = items.length;
        setSessionId(session.id);
        setQueue(items);
        shownAt.current = Date.now();
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : 'Could not load your queue.');
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [minutes, goalId]);

  const item = queue[index];
  const now = useMemo(() => new Date(), [item, revealed]); // eslint-disable-line react-hooks/exhaustive-deps

  const clozeMatch = useMemo(() => {
    if (!item || item.itemType !== 'cloze' || !answerText.trim()) return null;
    return normalize(answerText) === normalize(item.answer);
  }, [item, answerText]);

  const finish = useCallback(async () => {
    setDone(true);
    if (sessionId) {
      try {
        await endSession(sessionId);
      } catch {
        // The reviews are already saved; a missing end time is not worth blocking the recap.
      }
    }
  }, [sessionId]);

  function reveal(dontKnow: boolean) {
    answeredAt.current = Date.now();
    setGaveUp(dontKnow);
    setRevealed(true);
  }

  async function rate(rating: Rating) {
    if (!item || !sessionId || saving) return;
    setSaving(true);
    setError(null);
    try {
      const next = await recordAnswer({
        sessionId,
        item,
        rating,
        confidence,
        responseMs: (answeredAt.current || Date.now()) - shownAt.current,
        answerText,
      });
      if (Platform.OS !== 'web') Haptics.selectionAsync().catch(() => {});
      finalRating.current[item.itemId] = rating;
      if (rating === 'again') missed.current.add(item.itemId);

      setTally((t) => ({
        ...t,
        [rating]: t[rating] + 1,
        newLearned: t.newLearned + (item.state === null && rating !== 'again' ? 1 : 0),
        nextDue: rating === 'again' ? t.nextDue : !t.nextDue || next.dueAt < t.nextDue ? next.dueAt : t.nextDue,
      }));

      // Carry the new state forward so a relearn later in this sitting schedules correctly.
      let nextQueue = queue.map((q, i) => (i === index ? { ...q, state: next } : q));
      if (rating === 'again') {
        const n = relearnCount.current[item.itemId] ?? 0;
        if (n < MAX_RELEARN_PER_ITEM) {
          relearnCount.current[item.itemId] = n + 1;
          nextQueue = [...nextQueue, { ...item, state: next }];
        }
      }
      setQueue(nextQueue);

      if (index + 1 >= nextQueue.length) {
        await finish();
      } else {
        setIndex(index + 1);
        setRevealed(false);
        setGaveUp(false);
        setAnswerText('');
        setConfidence(null);
        answeredAt.current = 0;
        shownAt.current = Date.now();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Could not save that answer. Try again.');
    } finally {
      setSaving(false);
    }
  }

  // ----- states -----

  if (loading) {
    return (
      <SafeAreaView style={[styles.safe, styles.center]}>
        <ActivityIndicator color={colors.lavenderDeep} />
      </SafeAreaView>
    );
  }

  if (!loading && queue.length === 0 && !done) {
    return (
      <SafeAreaView style={[styles.safe, styles.center, { padding: spacing.xl }]}>
        <Text style={styles.bigTitle}>{error ? 'Something went wrong' : "You're all caught up"}</Text>
        <Text style={styles.muted}>
          {error ?? 'Nothing is due right now. Publish more cards from a goal, or come back when reviews are due.'}
        </Text>
        <Pressable style={[styles.primary, { marginTop: spacing.xl }]} onPress={() => router.back()} accessibilityRole="button">
          <Text style={styles.primaryText}>Back</Text>
        </Pressable>
      </SafeAreaView>
    );
  }

  if (done) {
    const reviewed = tally.again + tally.hard + tally.good + tally.easy;
    const holding = Object.values(finalRating.current).filter((r) => r === 'good' || r === 'easy').length;
    const misses = missed.current.size;
    return (
      <SafeAreaView style={styles.safe}>
        <ScrollView contentContainerStyle={styles.screen}>
          <Text style={styles.bigTitle}>Session recap</Text>
          <Text style={styles.muted}>
            {reviewed} {reviewed === 1 ? 'answer' : 'answers'} across {uniqueTotal.current}{' '}
            {uniqueTotal.current === 1 ? 'card' : 'cards'}
            {tally.newLearned > 0 ? ` · ${tally.newLearned} new learned` : ''}
          </Text>

          <View style={styles.recapGrid}>
            {RATINGS.map((r) => (
              <View key={r.rating} style={[styles.recapCell, { backgroundColor: r.bg }]}>
                <Text style={styles.recapNumber}>{tally[r.rating]}</Text>
                <Text style={styles.recapLabel}>{r.label}</Text>
              </View>
            ))}
          </View>

          <View style={styles.card}>
            <Text style={styles.sectionLabel}>What changed</Text>
            <Text style={styles.body}>
              {holding > 0
                ? `${holding} ${holding === 1 ? 'card is' : 'cards are'} holding — ${holding === 1 ? 'it comes' : 'they come'} back later than before.`
                : 'No cards felt solid yet — that is normal early on.'}
              {misses > 0
                ? ` ${misses} ${misses === 1 ? 'card was' : 'cards were'} missed and practised again; ${misses === 1 ? 'it returns' : 'they return'} sooner.`
                : ''}
            </Text>
            <Text style={[styles.sectionLabel, { marginTop: spacing.md }]}>What's next</Text>
            <Text style={styles.body}>
              {tally.nextDue ? `Your next review is ${formatWhen(tally.nextDue)}.` : 'Check back tomorrow for your next reviews.'}
            </Text>
          </View>

          <Pressable style={[styles.primary, { marginTop: spacing.lg }]} onPress={() => router.back()} accessibilityRole="button">
            <Text style={styles.primaryText}>Done</Text>
          </Pressable>
        </ScrollView>
      </SafeAreaView>
    );
  }

  // ----- active card -----

  const remaining = queue.length - index;
  return (
    <SafeAreaView style={styles.safe}>
      <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
        <View style={styles.topBar}>
          <Pressable onPress={finish} hitSlop={12} accessibilityRole="button" accessibilityLabel="End session">
            <Text style={styles.close}>End</Text>
          </Pressable>
          <Text style={styles.progress} accessibilityLabel={`${remaining} cards left`}>
            {remaining} left
          </Text>
        </View>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${(index / queue.length) * 100}%` }]} />
        </View>

        <ScrollView contentContainerStyle={styles.screen} keyboardShouldPersistTaps="handled">
          <View style={styles.metaRow}>
            <View style={styles.pill}>
              <Text style={styles.pillText}>{TYPE_LABEL[item.itemType]}</Text>
            </View>
            {item.state === null ? (
              <View style={[styles.pill, { backgroundColor: colors.lavenderSoft }]}>
                <Text style={styles.pillText}>new</Text>
              </View>
            ) : null}
            {!goalId ? <Text style={styles.goalName}>{item.goalTitle}</Text> : null}
          </View>

          <View style={styles.card}>
            <Text style={styles.prompt} accessibilityRole="header">
              {item.prompt}
            </Text>
          </View>

          {!revealed ? (
            <>
              <TextInput
                style={[styles.input, item.itemType === 'explain_back' && styles.inputTall]}
                placeholder={item.itemType === 'explain_back' ? 'Explain it in your own words…' : 'Your answer'}
                placeholderTextColor={colors.muted}
                value={answerText}
                onChangeText={setAnswerText}
                multiline={item.itemType === 'explain_back'}
                textAlignVertical="top"
                returnKeyType={item.itemType === 'explain_back' ? 'default' : 'done'}
                onSubmitEditing={() => item.itemType !== 'explain_back' && reveal(false)}
                accessibilityLabel="Your answer"
              />
              <Text style={styles.smallLabel}>How sure are you? (optional)</Text>
              <View style={styles.chips}>
                {CONFIDENCE.map((c) => (
                  <Pressable
                    key={c.value}
                    onPress={() => setConfidence(confidence === c.value ? null : c.value)}
                    style={[styles.chip, confidence === c.value && styles.chipOn]}
                    accessibilityRole="button"
                    accessibilityState={{ selected: confidence === c.value }}
                  >
                    <Text style={[styles.chipText, confidence === c.value && styles.chipTextOn]}>
                      {confidence === c.value ? '✓ ' : ''}
                      {c.label}
                    </Text>
                  </Pressable>
                ))}
              </View>
              <Pressable style={styles.primary} onPress={() => reveal(false)} accessibilityRole="button">
                <Text style={styles.primaryText}>Show answer</Text>
              </Pressable>
              <Pressable style={styles.secondary} onPress={() => reveal(true)} accessibilityRole="button">
                <Text style={styles.secondaryText}>I don't know</Text>
              </Pressable>
            </>
          ) : (
            <>
              <View style={styles.answerBox}>
                <Text style={styles.smallLabel}>Answer</Text>
                <Text style={styles.answer}>{item.answer}</Text>
                {answerText.trim() ? (
                  <>
                    <Text style={[styles.smallLabel, { marginTop: spacing.md }]}>You said</Text>
                    <Text style={styles.body}>{answerText.trim()}</Text>
                    {clozeMatch !== null ? (
                      <Text style={[styles.matchNote, { color: clozeMatch ? '#2d7a5a' : '#a14b4b' }]}>
                        {clozeMatch ? '✓ Matches' : '✗ Not an exact match — judge for yourself'}
                      </Text>
                    ) : null}
                  </>
                ) : null}
              </View>

              <Text style={styles.smallLabel}>How did it go?</Text>
              <View style={styles.ratings}>
                {RATINGS.map((r) => {
                  const suggested = gaveUp && r.rating === 'again';
                  return (
                    <Pressable
                      key={r.rating}
                      style={[styles.rating, { backgroundColor: r.bg }, suggested && styles.ratingSuggested]}
                      onPress={() => rate(r.rating)}
                      disabled={saving}
                      accessibilityRole="button"
                      accessibilityLabel={`${r.label}: ${r.hint}. Next review in ${previewLabel(item.state, r.rating, now)}`}
                    >
                      <Text style={styles.ratingLabel}>{r.label}</Text>
                      <Text style={styles.ratingInterval}>{previewLabel(item.state, r.rating, now)}</Text>
                    </Pressable>
                  );
                })}
              </View>
              {saving ? <ActivityIndicator style={{ marginTop: spacing.md }} color={colors.lavenderDeep} /> : null}
            </>
          )}

          {error ? <Text style={styles.error}>{error}</Text> : null}
        </ScrollView>
      </KeyboardAvoidingView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  safe: { flex: 1, backgroundColor: colors.bg },
  center: { alignItems: 'center', justifyContent: 'center' },
  screen: { padding: spacing.xl, paddingBottom: 60, gap: spacing.md },
  topBar: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.sm,
  },
  close: { color: colors.muted, fontSize: 15, fontWeight: '600' },
  progress: { color: colors.muted, fontSize: 13, fontWeight: '600' },
  progressTrack: {
    height: 4,
    backgroundColor: colors.line,
    marginHorizontal: spacing.xl,
    marginTop: spacing.sm,
    borderRadius: 2,
    overflow: 'hidden',
  },
  progressFill: { height: 4, backgroundColor: colors.lavenderDeep },
  metaRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexWrap: 'wrap' },
  goalName: { color: colors.muted, fontSize: 13 },
  pill: {
    paddingHorizontal: 10,
    paddingVertical: 3,
    borderRadius: radii.pill,
    backgroundColor: colors.pillBg,
    borderWidth: 1,
    borderColor: colors.line,
  },
  pillText: { ...typeTokens.pill, color: colors.pillText },
  card: { backgroundColor: colors.surface, borderRadius: radii.lg, padding: spacing.lg, borderWidth: 1, borderColor: colors.line },
  prompt: { fontSize: 20, lineHeight: 28, color: colors.ink, fontWeight: '600' },
  input: {
    backgroundColor: colors.surface,
    borderWidth: 1,
    borderColor: colors.line,
    borderRadius: radii.md,
    padding: spacing.md,
    fontSize: 16,
    color: colors.ink,
  },
  inputTall: { minHeight: 110 },
  smallLabel: { color: colors.muted, fontSize: 12, fontWeight: '700', textTransform: 'uppercase', letterSpacing: 0.4 },
  chips: { flexDirection: 'row', gap: spacing.sm },
  chip: {
    paddingHorizontal: 14,
    paddingVertical: 8,
    borderRadius: radii.pill,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.surface,
  },
  chipOn: { backgroundColor: colors.lavenderDeep, borderColor: colors.lavenderDeep },
  chipText: { color: colors.ink, fontSize: 14, fontWeight: '600' },
  chipTextOn: { color: '#ffffff' },
  primary: {
    backgroundColor: colors.lavenderDeep,
    borderRadius: radii.md,
    paddingVertical: 15,
    alignItems: 'center',
    alignSelf: 'stretch',
  },
  primaryText: { color: '#ffffff', fontSize: 16, fontWeight: '700' },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { color: colors.lavenderDeep, fontSize: 15, fontWeight: '600' },
  answerBox: { backgroundColor: colors.mint, borderRadius: radii.lg, padding: spacing.lg },
  answer: { fontSize: 18, lineHeight: 26, color: colors.ink, fontWeight: '600', marginTop: 4 },
  body: { fontSize: 15, lineHeight: 22, color: colors.ink, marginTop: 4 },
  matchNote: { marginTop: spacing.sm, fontSize: 13, fontWeight: '700' },
  ratings: { flexDirection: 'row', gap: spacing.sm },
  rating: { flex: 1, borderRadius: radii.md, paddingVertical: 14, alignItems: 'center', gap: 2 },
  ratingSuggested: { borderWidth: 2, borderColor: colors.ink },
  ratingLabel: { fontSize: 15, fontWeight: '700', color: colors.ink },
  ratingInterval: { fontSize: 12, color: colors.pillText },
  error: { color: '#a14b4b', fontSize: 14, textAlign: 'center' },
  bigTitle: { fontSize: 24, fontWeight: '700', color: colors.ink, textAlign: 'center' },
  muted: { color: colors.muted, fontSize: 15, lineHeight: 21, textAlign: 'center', marginTop: spacing.sm },
  sectionLabel: { ...typeTokens.sectionLabel, color: colors.ink },
  recapGrid: { flexDirection: 'row', gap: spacing.sm, marginTop: spacing.lg },
  recapCell: { flex: 1, borderRadius: radii.md, paddingVertical: spacing.md, alignItems: 'center' },
  recapNumber: { fontSize: 22, fontWeight: '700', color: colors.ink },
  recapLabel: { fontSize: 12, fontWeight: '600', color: colors.pillText },
});
