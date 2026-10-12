// Mirrors the Supabase schema (Paly MVP Spec, "Supabase data model").
export type GoalMode = 'exam' | 'explore';
export type GoalStatus = 'active' | 'archived' | 'completed';
export type SourceStatus = 'pending' | 'ingested' | 'failed';
export type ConceptState = 'new' | 'learning' | 'holding' | 'strong';
export type ItemType = 'short_answer' | 'cloze' | 'explain_back';
export type ItemOrigin = 'ai' | 'user';
export type ItemStatus = 'draft' | 'published' | 'archived';

export interface LearningGoal {
  id: string;
  user_id: string;
  mode: GoalMode;
  title: string;
  subject: string | null;
  exam_at: string | null;
  cadence: string | null;
  status: GoalStatus;
  created_at: string;
}

export interface SourceRow {
  id: string;
  goal_id: string;
  type: 'text' | 'photo' | 'pdf';
  title: string | null;
  storage_path: string | null;
  raw_text: string | null;
  status: SourceStatus;
  page_count: number | null;
  created_at: string;
}

export interface ConceptRow {
  id: string;
  goal_id: string;
  name: string;
  explanation: string;
  state: ConceptState;
  archived_at: string | null;
  created_at: string;
}

export interface StudyItemRow {
  id: string;
  goal_id: string;
  prompt: string;
  answer: string;
  item_type: ItemType;
  origin: ItemOrigin;
  status: ItemStatus;
  created_at: string;
}

// Milestone 2 · Recall
export type ReviewRating = 'again' | 'hard' | 'good' | 'easy';

export interface MemoryStateRow {
  item_id: string;
  user_id: string;
  difficulty: number;
  stability: number;
  due_at: string;
  last_review_at: string;
  reps: number;
  lapses: number;
}

export interface StudySessionRow {
  id: string;
  user_id: string;
  goal_id: string | null;
  mode: 'daily' | 'goal';
  planned_minutes: number | null;
  started_at: string;
  ended_at: string | null;
}

export interface ReviewRow {
  id: string;
  session_id: string;
  item_id: string;
  user_id: string;
  result: ReviewRating;
  confidence: 1 | 2 | 3 | null;
  response_ms: number | null;
  answer_text: string | null;
  reviewed_at: string;
}
