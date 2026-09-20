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
