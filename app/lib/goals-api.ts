import { supabase } from './supabase';
import type { ConceptRow, GoalMode, LearningGoal, SourceRow, StudyItemRow } from './types';

const MAX_CHUNK_CHARS = 600;

// Simple, dependency-free chunker for the text-only capture path: split on
// paragraph breaks, then further split any long paragraph on sentence
// boundaries so no chunk is wildly larger than the others.
export function chunkText(raw: string): string[] {
  const paragraphs = raw
    .split(/\n{2,}/)
    .map((p) => p.trim())
    .filter(Boolean);

  const chunks: string[] = [];
  for (const paragraph of paragraphs) {
    if (paragraph.length <= MAX_CHUNK_CHARS) {
      chunks.push(paragraph);
      continue;
    }
    const sentences = paragraph.split(/(?<=[.!?])\s+/);
    let current = '';
    for (const sentence of sentences) {
      if ((current + ' ' + sentence).trim().length > MAX_CHUNK_CHARS && current) {
        chunks.push(current.trim());
        current = sentence;
      } else {
        current = `${current} ${sentence}`.trim();
      }
    }
    if (current) chunks.push(current.trim());
  }
  return chunks;
}

export async function listGoals(): Promise<LearningGoal[]> {
  const { data, error } = await supabase
    .from('learning_goals')
    .select('*')
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

export async function getGoal(goalId: string): Promise<LearningGoal> {
  const { data, error } = await supabase.from('learning_goals').select('*').eq('id', goalId).single();
  if (error) throw error;
  return data;
}

export async function createGoal(input: {
  mode: GoalMode;
  title: string;
  subject?: string;
  examAt?: string | null;
  cadence?: string;
}): Promise<LearningGoal> {
  const {
    data: { user },
  } = await supabase.auth.getUser();
  if (!user) throw new Error('Not signed in');

  const { data, error } = await supabase
    .from('learning_goals')
    .insert({
      user_id: user.id,
      mode: input.mode,
      title: input.title,
      subject: input.subject || null,
      exam_at: input.examAt || null,
      cadence: input.cadence || null,
    })
    .select()
    .single();
  if (error) throw error;
  return data;
}

export async function listSources(goalId: string): Promise<SourceRow[]> {
  const { data, error } = await supabase
    .from('sources')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: false });
  if (error) throw error;
  return data;
}

// Capture (text-only, Milestone 1): store the raw text, chunk it, mark ingested.
export async function captureTextSource(goalId: string, title: string, rawText: string): Promise<SourceRow> {
  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .insert({ goal_id: goalId, type: 'text', title, raw_text: rawText, status: 'pending' })
    .select()
    .single();
  if (sourceError) throw sourceError;

  const chunks = chunkText(rawText);
  if (chunks.length === 0) throw new Error('Nothing to capture — paste some text first.');

  const { error: chunksError } = await supabase.from('source_chunks').insert(
    chunks.map((text, ordinal) => ({ source_id: source.id, ordinal, text }))
  );
  if (chunksError) throw chunksError;

  const { data: ingested, error: updateError } = await supabase
    .from('sources')
    .update({ status: 'ingested', page_count: chunks.length })
    .eq('id', source.id)
    .select()
    .single();
  if (updateError) throw updateError;
  return ingested;
}

export async function generateStudySet(sourceId: string) {
  // The edge function derives the destination goal from the source itself
  // rather than trusting a client-supplied goal_id.
  const { data, error } = await supabase.functions.invoke('generate-set', {
    body: { source_id: sourceId },
  });
  if (error) throw error;
  return data as { job_id: string; concepts: ConceptRow[]; items: StudyItemRow[] };
}

export async function listConcepts(goalId: string): Promise<ConceptRow[]> {
  const { data, error } = await supabase
    .from('concepts')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function listStudyItems(goalId: string): Promise<StudyItemRow[]> {
  const { data, error } = await supabase
    .from('study_items')
    .select('*')
    .eq('goal_id', goalId)
    .order('created_at', { ascending: true });
  if (error) throw error;
  return data;
}

export async function updateStudyItem(
  itemId: string,
  patch: Partial<Pick<StudyItemRow, 'prompt' | 'answer' | 'status'>>
): Promise<StudyItemRow> {
  const { data, error } = await supabase.from('study_items').update(patch).eq('id', itemId).select().single();
  if (error) throw error;
  return data;
}
