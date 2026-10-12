// Milestone 2 · Recall: sessions, the daily queue, and recording answers.
import { buildQueue, schedule, type MemoryState, type QueueCandidate, type Rating } from './scheduler';
import { supabase } from './supabase';
import type { ItemType, MemoryStateRow, ReviewRow, StudySessionRow } from './types';

export interface QueueItem extends QueueCandidate {
  prompt: string;
  answer: string;
  itemType: ItemType;
  goalTitle: string;
}

export function toMemoryState(row: MemoryStateRow): MemoryState {
  return {
    difficulty: row.difficulty,
    stability: row.stability,
    dueAt: new Date(row.due_at),
    lastReviewAt: new Date(row.last_review_at),
    reps: row.reps,
    lapses: row.lapses,
  };
}

function startOfToday(now = new Date()) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  return d;
}

interface ItemWithJoins {
  id: string;
  goal_id: string;
  prompt: string;
  answer: string;
  item_type: ItemType;
  created_at: string;
  learning_goals: { title: string; exam_at: string | null; status: string } | null;
  memory_states: MemoryStateRow | MemoryStateRow[] | null;
}

/** Every published item in an active goal, with its scheduler state. */
async function loadCandidates(goalId?: string): Promise<QueueItem[]> {
  let query = supabase
    .from('study_items')
    .select(
      'id, goal_id, prompt, answer, item_type, created_at, learning_goals!inner(title, exam_at, status), memory_states(*)'
    )
    .eq('status', 'published')
    .eq('learning_goals.status', 'active');
  if (goalId) query = query.eq('goal_id', goalId);

  const { data, error } = await query;
  if (error) throw error;

  return (data as unknown as ItemWithJoins[]).map((row) => {
    const ms = Array.isArray(row.memory_states) ? row.memory_states[0] : row.memory_states;
    return {
      itemId: row.id,
      goalId: row.goal_id,
      prompt: row.prompt,
      answer: row.answer,
      itemType: row.item_type,
      goalTitle: row.learning_goals?.title ?? '',
      createdAt: new Date(row.created_at),
      goalExamAt: row.learning_goals?.exam_at ? new Date(row.learning_goals.exam_at) : null,
      state: ms ? toMemoryState(ms) : null,
    };
  });
}

/** How many never-seen items were first reviewed today (enforces the daily new-item cap). */
async function countNewIntroducedToday(): Promise<number> {
  const today = startOfToday().toISOString();
  const { data: todays, error } = await supabase.from('reviews').select('item_id').gte('reviewed_at', today);
  if (error) throw error;
  const ids = [...new Set((todays ?? []).map((r) => r.item_id as string))];
  if (ids.length === 0) return 0;

  const { data: earlier, error: earlierError } = await supabase
    .from('reviews')
    .select('item_id')
    .in('item_id', ids)
    .lt('reviewed_at', today);
  if (earlierError) throw earlierError;
  const seenBefore = new Set((earlier ?? []).map((r) => r.item_id as string));
  return ids.filter((id) => !seenBefore.has(id)).length;
}

export interface TodaySummary {
  dueCount: number;
  newCount: number;
  totalPublished: number;
  nextDueAt: Date | null;
  byGoal: Record<string, { due: number; fresh: number }>;
}

/** Answers "What should I study now?" for the Home and Study screens. */
export async function getTodaySummary(now = new Date()): Promise<TodaySummary> {
  const [candidates, introduced] = await Promise.all([loadCandidates(), countNewIntroducedToday()]);
  const queue = buildQueue(candidates, now, 24 * 60, introduced);

  const byGoal: TodaySummary['byGoal'] = {};
  for (const c of queue) {
    byGoal[c.goalId] ??= { due: 0, fresh: 0 };
    if (c.state) byGoal[c.goalId].due++;
    else byGoal[c.goalId].fresh++;
  }

  const future = candidates
    .filter((c) => c.state && !queue.includes(c))
    .map((c) => c.state!.dueAt.getTime())
    .sort((a, b) => a - b);

  return {
    dueCount: queue.filter((c) => c.state).length,
    newCount: queue.filter((c) => !c.state).length,
    totalPublished: candidates.length,
    nextDueAt: future.length ? new Date(future[0]) : null,
    byGoal,
  };
}

/** Today's queue, trimmed to the time the learner has. */
export async function getQueue(minutes: number, goalId?: string, now = new Date()): Promise<QueueItem[]> {
  const [candidates, introduced] = await Promise.all([loadCandidates(goalId), countNewIntroducedToday()]);
  return buildQueue(candidates, now, minutes, introduced) as QueueItem[];
}

export async function startSession(minutes: number, goalId?: string): Promise<StudySessionRow> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');
  const { data, error } = await supabase
    .from('study_sessions')
    .insert({ user_id: user.id, goal_id: goalId ?? null, mode: goalId ? 'goal' : 'daily', planned_minutes: minutes })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function endSession(sessionId: string): Promise<void> {
  const { error } = await supabase
    .from('study_sessions')
    .update({ ended_at: new Date().toISOString() })
    .eq('id', sessionId);
  if (error) throw error;
}

/**
 * Records one answer: schedules the next review and writes the immutable
 * review + new memory state in a single database transaction.
 */
export async function recordAnswer(input: {
  sessionId: string;
  item: QueueItem;
  rating: Rating;
  confidence: 1 | 2 | 3 | null;
  responseMs: number;
  answerText: string;
}): Promise<MemoryState> {
  const next = schedule(input.item.state, input.rating, new Date());
  const { error } = await supabase.rpc('record_review', {
    p_session_id: input.sessionId,
    p_item_id: input.item.itemId,
    p_result: input.rating,
    p_confidence: input.confidence,
    p_response_ms: Math.max(0, Math.round(input.responseMs)),
    p_answer_text: input.answerText.trim() || null,
    p_difficulty: next.difficulty,
    p_stability: next.stability,
    p_due_at: next.dueAt.toISOString(),
  });
  if (error) throw error;
  return next;
}

export async function listSessionReviews(sessionId: string): Promise<ReviewRow[]> {
  const { data, error } = await supabase
    .from('reviews')
    .select('*')
    .eq('session_id', sessionId)
    .order('reviewed_at', { ascending: true });
  if (error) throw error;
  return data;
}
