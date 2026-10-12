// Spaced-repetition scheduler (Paly MVP Spec, capability 5 "Adaptive review").
//
// Implements the FSRS-4.5 memory model with its published default weights.
// Each item carries two numbers:
//   stability  – days until recall probability falls to 90%
//   difficulty – 1 (easy) … 10 (hard); moves with each rating
// Good answers grow stability (more when the item was nearly forgotten);
// "Again" shrinks it and brings the item back in a few minutes.
//
// Pure functions only: no I/O, so it is unit-tested in scheduler.test.ts and
// the result is written to Supabase atomically by the record_review RPC.

export type Rating = 'again' | 'hard' | 'good' | 'easy';

export interface MemoryState {
  difficulty: number;
  stability: number;
  dueAt: Date;
  lastReviewAt: Date;
  reps: number;
  lapses: number;
}

const W = [
  0.4872, 1.4003, 3.7145, 13.8206, 5.1618, 1.2298, 0.8975, 0.031, 1.6474, 0.1367, 1.0461, 2.1072, 0.0793,
  0.3246, 1.587, 0.2272, 2.8755,
];
const DECAY = -0.5;
const FACTOR = 19 / 81; // makes R(t = S) = 0.9
const DESIRED_RETENTION = 0.9;
const MAX_INTERVAL_DAYS = 365;
const RELEARN_MINUTES = 10;
const DAY_MS = 86_400_000;

const GRADE: Record<Rating, number> = { again: 1, hard: 2, good: 3, easy: 4 };

const clamp = (x: number, lo: number, hi: number) => Math.min(hi, Math.max(lo, x));

/** Probability the learner still recalls the item `elapsedDays` after the last review. */
export function retrievability(elapsedDays: number, stability: number): number {
  return Math.pow(1 + (FACTOR * Math.max(0, elapsedDays)) / stability, DECAY);
}

function initialDifficulty(grade: number) {
  return clamp(W[4] - (grade - 3) * W[5], 1, 10);
}

function nextDifficulty(d: number, grade: number) {
  const moved = d - W[6] * (grade - 3);
  return clamp(W[7] * initialDifficulty(4) + (1 - W[7]) * moved, 1, 10);
}

function stabilityAfterSuccess(d: number, s: number, r: number, grade: number) {
  const hardPenalty = grade === 2 ? W[15] : 1;
  const easyBonus = grade === 4 ? W[16] : 1;
  return (
    s *
    (Math.exp(W[8]) * (11 - d) * Math.pow(s, -W[9]) * (Math.exp(W[10] * (1 - r)) - 1) * hardPenalty * easyBonus + 1)
  );
}

function stabilityAfterLapse(d: number, s: number, r: number) {
  const next = W[11] * Math.pow(d, -W[12]) * (Math.pow(s + 1, W[13]) - 1) * Math.exp(W[14] * (1 - r));
  return Math.min(next, s);
}

/** Days until recall probability drops to the target retention. */
export function intervalDays(stability: number): number {
  const raw = (stability / FACTOR) * (Math.pow(DESIRED_RETENTION, 1 / DECAY) - 1);
  return clamp(Math.round(raw), 1, MAX_INTERVAL_DAYS);
}

/** Next memory state after answering an item with `rating` at time `now`. `prev` is null for a first review. */
export function schedule(prev: MemoryState | null, rating: Rating, now: Date): MemoryState {
  const grade = GRADE[rating];
  let difficulty: number;
  let stability: number;

  if (!prev) {
    difficulty = initialDifficulty(grade);
    stability = W[grade - 1];
  } else {
    const elapsed = (now.getTime() - prev.lastReviewAt.getTime()) / DAY_MS;
    const r = retrievability(elapsed, prev.stability);
    difficulty = nextDifficulty(prev.difficulty, grade);
    stability =
      grade === 1
        ? stabilityAfterLapse(prev.difficulty, prev.stability, r)
        : stabilityAfterSuccess(prev.difficulty, prev.stability, r, grade);
  }
  stability = Math.max(stability, 0.1);

  const dueAt =
    rating === 'again'
      ? new Date(now.getTime() + RELEARN_MINUTES * 60_000)
      : new Date(now.getTime() + intervalDays(stability) * DAY_MS);

  return {
    difficulty,
    stability,
    dueAt,
    lastReviewAt: now,
    reps: (prev?.reps ?? 0) + 1,
    lapses: (prev?.lapses ?? 0) + (rating === 'again' ? 1 : 0),
  };
}

/** Short label for the interval each rating would give, e.g. "10m", "3d", "2mo". Shown on the rating buttons. */
export function previewLabel(prev: MemoryState | null, rating: Rating, now: Date): string {
  const next = schedule(prev, rating, now);
  const minutes = Math.round((next.dueAt.getTime() - now.getTime()) / 60_000);
  if (minutes < 60) return `${minutes}m`;
  const days = Math.round(minutes / 1440);
  if (days < 31) return `${days}d`;
  if (days < 365) return `${Math.round(days / 30)}mo`;
  return `${Math.round(days / 365)}y`;
}

// ---------------------------------------------------------------------------
// Daily queue: "What should I study now?" (spec principle: one next action)
// ---------------------------------------------------------------------------

export interface QueueCandidate {
  itemId: string;
  goalId: string;
  state: MemoryState | null; // null = never reviewed
  createdAt: Date;
  goalExamAt: Date | null;
}

export const SECONDS_PER_ITEM = 25;
export const NEW_ITEMS_PER_DAY = 10;

/**
 * Builds today's queue: due items first, ordered by urgency (least likely to
 * be remembered), weakness (lapses) and goal relevance (an exam within two
 * weeks), then up to NEW_ITEMS_PER_DAY never-seen items, oldest first —
 * all trimmed to fit `minutes`.
 */
export function buildQueue(
  candidates: QueueCandidate[],
  now: Date,
  minutes: number,
  newIntroducedToday = 0
): QueueCandidate[] {
  const endOfToday = new Date(now);
  endOfToday.setHours(23, 59, 59, 999);

  const examBoost = (c: QueueCandidate) => {
    if (!c.goalExamAt) return 0;
    const daysLeft = (c.goalExamAt.getTime() - now.getTime()) / DAY_MS;
    return daysLeft >= 0 && daysLeft <= 14 ? 0.3 * (1 - daysLeft / 14) : 0;
  };

  const due = candidates
    .filter((c) => c.state && c.state.dueAt <= endOfToday)
    .map((c) => {
      const s = c.state!;
      const elapsed = (now.getTime() - s.lastReviewAt.getTime()) / DAY_MS;
      const forgetting = 1 - retrievability(elapsed, s.stability);
      return { c, score: forgetting + Math.min(s.lapses, 5) * 0.04 + examBoost(c) };
    })
    .sort((a, b) => b.score - a.score)
    .map((x) => x.c);

  const newAllowance = Math.max(0, NEW_ITEMS_PER_DAY - newIntroducedToday);
  const fresh = candidates
    .filter((c) => !c.state)
    .sort((a, b) => examBoost(b) - examBoost(a) || a.createdAt.getTime() - b.createdAt.getTime())
    .slice(0, newAllowance);

  const capacity = Math.max(1, Math.floor((minutes * 60) / SECONDS_PER_ITEM));
  return [...due, ...fresh].slice(0, capacity);
}
