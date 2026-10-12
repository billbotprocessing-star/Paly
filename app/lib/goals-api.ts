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

export interface AiUsage {
  plan: 'free' | 'pro';
  used_month: number;
  monthly_limit: number;
  used_today: number;
  daily_limit: number;
  max_source_chars: number;
  resets_at?: string;
}

/** Thrown when the learner has used up their AI generations for now. */
export class UsageLimitError extends Error {
  constructor(
    public reason: 'monthly' | 'daily',
    public usage: AiUsage
  ) {
    super(
      reason === 'daily'
        ? `You've used today's ${usage.daily_limit} AI generations. Your source is saved — generate it tomorrow.`
        : `You've used all ${usage.monthly_limit} AI generations on the ${usage.plan} plan this month. Your source is saved — generate it when your allowance resets.`
    );
    this.name = 'UsageLimitError';
  }
}

export async function getMyUsage(): Promise<AiUsage> {
  const { data, error } = await supabase.rpc('get_my_usage');
  if (error) throw error;
  return data as AiUsage;
}

export async function generateStudySet(sourceId: string) {
  // The edge function derives the destination goal from the source itself
  // rather than trusting a client-supplied goal_id.
  const { data, error } = await supabase.functions.invoke('generate-set', {
    body: { source_id: sourceId },
  });
  if (error) {
    // Non-2xx responses carry a JSON body explaining what happened.
    const body = await (error as { context?: Response }).context?.json?.().catch(() => null);
    if (body?.error === 'limit_reached') throw new UsageLimitError(body.reason, body.usage);
    throw new Error(body?.error ? `Generation failed: ${body.error}` : error.message);
  }
  return data as {
    job_id: string;
    concepts: ConceptRow[];
    items: StudyItemRow[];
    truncated: boolean;
    usage: AiUsage | null;
  };
}

/** Latest GENERATE_SET job per source, so failed or limited sources can be retried. */
export async function listGenerationJobs(sourceIds: string[]): Promise<Record<string, { status: string; error_code: string | null }>> {
  if (sourceIds.length === 0) return {};
  const { data, error } = await supabase
    .from('ai_jobs')
    .select('entity_id, status, error_code')
    .eq('job_type', 'GENERATE_SET')
    .in('entity_id', sourceIds);
  if (error) throw error;
  return Object.fromEntries((data ?? []).map((j) => [j.entity_id as string, { status: j.status, error_code: j.error_code }]));
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

/** Publish every draft item in a goal at once (after the learner has looked them over). */
export async function publishAllDrafts(goalId: string): Promise<void> {
  const { error } = await supabase
    .from('study_items')
    .update({ status: 'published' })
    .eq('goal_id', goalId)
    .eq('status', 'draft');
  if (error) throw error;
}
