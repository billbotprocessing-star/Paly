// GENERATE_SET job (see Paly MVP Spec, "Automation architecture").
//
// This is the trusted server boundary the spec requires: the mobile app
// never holds a service-role key, it calls this function with the user's
// own JWT, and every read/write here goes through RLS as that user.
//
// The extraction logic below is a placeholder heuristic (one concept per
// source chunk, one cloze item per concept) so the full capture -> generate
// -> recall loop is exercisable end to end today. It implements the same
// job contract (ai_jobs row, idempotency key, status transitions, input/
// output shape) that a real n8n GENERATE_SET webhook will use — swap the
// body of `generateDraftSet` for a call to that webhook later without
// touching the app or the schema.
import { createClient } from 'jsr:@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: unknown, status: number) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

interface RequestBody {
  source_id: string;
}

interface ChunkRow {
  id: string;
  ordinal: number;
  text: string;
}

function splitSentences(text: string): string[] {
  return text
    .split(/(?<=[.!?])\s+/)
    .map((s) => s.trim())
    .filter(Boolean);
}

function pickClozeWord(sentence: string): string | null {
  const words = sentence.replace(/[.,;:!?]/g, '').split(/\s+/);
  const candidates = words.filter((w) => w.length > 5);
  if (candidates.length === 0) return null;
  return candidates.reduce((a, b) => (b.length > a.length ? b : a));
}

function draftConceptFromChunk(chunk: ChunkRow) {
  const sentences = splitSentences(chunk.text);
  const first = sentences[0] ?? chunk.text;
  const name = first.length > 60 ? `${first.slice(0, 57)}...` : first;
  const explanation = chunk.text.trim();

  const clozeWord = pickClozeWord(first);
  const item =
    clozeWord != null
      ? {
          prompt: first.replace(clozeWord, '_____'),
          answer: clozeWord,
          item_type: 'cloze' as const,
        }
      : {
          prompt: `In your own words, explain: ${name}`,
          answer: explanation,
          item_type: 'explain_back' as const,
        };

  return { name, explanation, item };
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'method_not_allowed' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return jsonResponse({ error: 'missing_authorization' }, 401);
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return jsonResponse({ error: 'unauthorized' }, 401);
  }
  const userId = userData.user.id;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return jsonResponse({ error: 'invalid_json' }, 400);
  }
  if (!body.source_id) {
    return jsonResponse({ error: 'source_id is required' }, 400);
  }

  // Derive the destination goal from the source itself (RLS-checked below)
  // rather than trusting the request body's goal_id, which a caller could
  // set to any goal they own regardless of which goal the source belongs to.
  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .select('id, goal_id')
    .eq('id', body.source_id)
    .single();
  if (sourceError || !source) {
    return jsonResponse({ error: 'source_not_found' }, 404);
  }
  const goalId = source.goal_id as string;

  const idempotencyKey = `generate-set:${body.source_id}`;

  const { data: job, error: jobError } = await supabase
    .from('ai_jobs')
    .upsert(
      {
        user_id: userId,
        job_type: 'GENERATE_SET',
        entity_id: body.source_id,
        idempotency_key: idempotencyKey,
        status: 'running',
        provider: 'stub-heuristic',
        attempt_count: 1,
      },
      { onConflict: 'user_id,idempotency_key' }
    )
    .select()
    .single();

  if (jobError || !job) {
    return jsonResponse({ error: jobError?.message ?? 'job_create_failed' }, 500);
  }

  try {
    // RLS scopes this to chunks the caller owns via source -> learning_goals.
    const { data: chunks, error: chunksError } = await supabase
      .from('source_chunks')
      .select('id, ordinal, text')
      .eq('source_id', body.source_id)
      .order('ordinal', { ascending: true });

    if (chunksError) throw new Error(chunksError.message);
    if (!chunks || chunks.length === 0) {
      throw new Error('no_chunks_for_source');
    }

    // Retry-without-duplicates: clear any previously AI-generated draft
    // concepts (and their still-draft study items) tied to this source's
    // chunks before regenerating.
    const chunkIds = chunks.map((c: ChunkRow) => c.id);
    const { data: staleLinks } = await supabase
      .from('concept_sources')
      .select('concept_id')
      .in('chunk_id', chunkIds);
    const staleConceptIds = [...new Set((staleLinks ?? []).map((l: { concept_id: string }) => l.concept_id))];
    if (staleConceptIds.length > 0) {
      const { data: staleItemLinks } = await supabase
        .from('item_concepts')
        .select('item_id')
        .in('concept_id', staleConceptIds);
      const staleItemIds = [...new Set((staleItemLinks ?? []).map((l: { item_id: string }) => l.item_id))];
      if (staleItemIds.length > 0) {
        await supabase.from('study_items').delete().in('id', staleItemIds).eq('status', 'draft');
      }
      await supabase.from('concepts').delete().in('id', staleConceptIds).eq('state', 'new');
    }

    const draftConcepts = chunks.map((chunk: ChunkRow) => ({
      chunk,
      draft: draftConceptFromChunk(chunk),
    }));

    const { data: insertedConcepts, error: conceptError } = await supabase
      .from('concepts')
      .insert(
        draftConcepts.map(({ draft }) => ({
          goal_id: goalId,
          name: draft.name,
          explanation: draft.explanation,
          state: 'new',
        }))
      )
      .select();
    if (conceptError) throw new Error(conceptError.message);

    const conceptSourceRows = insertedConcepts.map((concept, i) => ({
      concept_id: concept.id,
      chunk_id: draftConcepts[i].chunk.id,
      relevance: 1,
    }));
    const { error: linkError } = await supabase.from('concept_sources').insert(conceptSourceRows);
    if (linkError) throw new Error(linkError.message);

    const { data: insertedItems, error: itemError } = await supabase
      .from('study_items')
      .insert(
        draftConcepts.map(({ draft }) => ({
          goal_id: goalId,
          prompt: draft.item.prompt,
          answer: draft.item.answer,
          item_type: draft.item.item_type,
          origin: 'ai',
          status: 'draft',
        }))
      )
      .select();
    if (itemError) throw new Error(itemError.message);

    const itemConceptRows = insertedItems.map((item, i) => ({
      item_id: item.id,
      concept_id: insertedConcepts[i].id,
      weight: 1,
    }));
    const { error: itemConceptError } = await supabase.from('item_concepts').insert(itemConceptRows);
    if (itemConceptError) throw new Error(itemConceptError.message);

    await supabase
      .from('ai_jobs')
      .update({ status: 'succeeded', completed_at: new Date().toISOString() })
      .eq('id', job.id);

    return jsonResponse({ job_id: job.id, concepts: insertedConcepts, items: insertedItems }, 200);
  } catch (err) {
    await supabase
      .from('ai_jobs')
      .update({
        status: 'failed',
        error_code: err instanceof Error ? err.message : 'unknown_error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return jsonResponse({ error: err instanceof Error ? err.message : 'unknown_error' }, 500);
  }
});
