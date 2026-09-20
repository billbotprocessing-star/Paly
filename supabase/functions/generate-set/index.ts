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

interface RequestBody {
  goal_id: string;
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
  if (req.method !== 'POST') {
    return new Response(JSON.stringify({ error: 'method_not_allowed' }), { status: 405 });
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'missing_authorization' }), { status: 401 });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: userData, error: userError } = await supabase.auth.getUser();
  if (userError || !userData.user) {
    return new Response(JSON.stringify({ error: 'unauthorized' }), { status: 401 });
  }
  const userId = userData.user.id;

  let body: RequestBody;
  try {
    body = await req.json();
  } catch {
    return new Response(JSON.stringify({ error: 'invalid_json' }), { status: 400 });
  }
  if (!body.goal_id || !body.source_id) {
    return new Response(JSON.stringify({ error: 'goal_id and source_id are required' }), { status: 400 });
  }

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
    return new Response(JSON.stringify({ error: jobError?.message ?? 'job_create_failed' }), { status: 500 });
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
    // concepts tied to this source's chunks before regenerating.
    const chunkIds = chunks.map((c: ChunkRow) => c.id);
    const { data: staleLinks } = await supabase
      .from('concept_sources')
      .select('concept_id')
      .in('chunk_id', chunkIds);
    const staleConceptIds = [...new Set((staleLinks ?? []).map((l: { concept_id: string }) => l.concept_id))];
    if (staleConceptIds.length > 0) {
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
          goal_id: body.goal_id,
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
          goal_id: body.goal_id,
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

    return new Response(
      JSON.stringify({ job_id: job.id, concepts: insertedConcepts, items: insertedItems }),
      { status: 200, headers: { 'Content-Type': 'application/json' } }
    );
  } catch (err) {
    await supabase
      .from('ai_jobs')
      .update({
        status: 'failed',
        error_code: err instanceof Error ? err.message : 'unknown_error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return new Response(
      JSON.stringify({ error: err instanceof Error ? err.message : 'unknown_error' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
