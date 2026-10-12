// GENERATE_SET job (see Paly MVP Spec, "Automation architecture").
//
// This is the trusted server boundary the spec requires: the mobile app
// never holds a service-role key, it calls this function with the user's
// own JWT, and every read/write here goes through RLS as that user.
//
// Generation: Claude reads the source's chunks and returns concepts, each
// tied to the chunk(s) it came from, with one to three recall prompts
// (short answer, cloze, explain-back). Output is validated before anything
// is written: unknown chunk references are dropped, so every concept keeps
// a traceable link to the learner's material (spec: "Trust").
//
// Usage limits: before calling Claude the function claims one credit from
// the learner's plan allowance (claim_generation, server-only, see
// migrations/*_ai_usage_limits.sql). Over the limit → 429 and no
// Claude call. The source is trimmed to the plan's max_source_chars. A failed
// generation hands the credit back.
//
// Secrets (Supabase dashboard → Edge Functions → Secrets):
//   ANTHROPIC_API_KEY      required for real generation
//   PALY_GENERATION_MODEL  optional, defaults to claude-sonnet-5-5
// SUPABASE_SERVICE_ROLE_KEY is provided automatically and is used ONLY for
// the credit bookkeeping; all study content is read and written as the user.
// With no API key the function falls back to the old placeholder heuristic
// (free, no credits used) so local development still works end to end. With
// a key, any Claude failure marks the job failed (visible and retryable)
// rather than quietly producing placeholder cards.
import { createClient } from 'jsr:@supabase/supabase-js@2';

import {
  MAX_CONCEPTS,
  MAX_ITEMS_PER_CONCEPT,
  validate,
  type ChunkRow,
  type DraftConcept,
  type DraftItem,
} from './validate.ts';

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


// ---------------------------------------------------------------------------
// Claude generation
// ---------------------------------------------------------------------------

const SYSTEM_PROMPT = `You turn a learner's study material into concepts and active-recall prompts.

Rules:
- Use ONLY facts stated in the passages. Never add outside knowledge.
- A concept is one idea worth remembering. Name it in 2-6 words. Explain it in 1-3 plain sentences.
- Every concept must cite the passage number(s) it came from.
- Write 1-3 prompts per concept. Mix types:
  - "short_answer": a direct question with a short, checkable answer.
  - "cloze": a sentence from the material with exactly one key term replaced by "_____"; answer is that term.
  - "explain_back": ask the learner to explain the idea in their own words; answer is a model explanation.
- Prompts must make sense on their own, without seeing the passage. Never write "according to the text".
- Answers must be short enough to check at a glance (a word, a phrase, or 1-2 sentences).
- Skip filler, examples that carry no idea, and duplicate concepts.
- Write in the same language as the material.`;

const TOOL = {
  name: 'save_study_set',
  description: 'Save the concepts and recall prompts extracted from the passages.',
  input_schema: {
    type: 'object',
    properties: {
      concepts: {
        type: 'array',
        maxItems: MAX_CONCEPTS,
        items: {
          type: 'object',
          properties: {
            name: { type: 'string' },
            explanation: { type: 'string' },
            passages: { type: 'array', items: { type: 'integer' }, minItems: 1 },
            items: {
              type: 'array',
              minItems: 1,
              maxItems: MAX_ITEMS_PER_CONCEPT,
              items: {
                type: 'object',
                properties: {
                  item_type: { type: 'string', enum: ['short_answer', 'cloze', 'explain_back'] },
                  prompt: { type: 'string' },
                  answer: { type: 'string' },
                },
                required: ['item_type', 'prompt', 'answer'],
              },
            },
          },
          required: ['name', 'explanation', 'passages', 'items'],
        },
      },
    },
    required: ['concepts'],
  },
};

async function generateWithClaude(
  chunks: ChunkRow[],
  apiKey: string,
  model: string,
  maxChars: number
): Promise<{ drafts: DraftConcept[]; truncated: boolean }> {
  // Whole chunks only, up to the plan's size limit (always at least one).
  let used = 0;
  const included: ChunkRow[] = [];
  for (const c of chunks) {
    if (included.length > 0 && used + c.text.length > maxChars) break;
    included.push(c);
    used += c.text.length;
  }
  const passages = included.map((c) => `<passage n="${c.ordinal}">\n${c.text}\n</passage>`).join('\n\n');

  const res = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01',
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      model,
      max_tokens: 8000,
      system: SYSTEM_PROMPT,
      tools: [TOOL],
      tool_choice: { type: 'tool', name: TOOL.name },
      messages: [{ role: 'user', content: `Study material:\n\n${passages}` }],
    }),
  });
  if (!res.ok) {
    const detail = (await res.text()).slice(0, 300);
    throw new Error(`claude_http_${res.status}: ${detail}`);
  }
  const data = await res.json();
  const toolUse = (data.content ?? []).find((b: { type: string }) => b.type === 'tool_use');
  if (!toolUse) throw new Error('claude_no_tool_output');

  return { drafts: validate(toolUse.input?.concepts, included), truncated: included.length < chunks.length };
}

interface ClaimResult {
  allowed: boolean;
  reason: 'monthly' | 'daily' | null;
  usage_id: string | null;
  plan: 'free' | 'pro';
  used_month: number;
  monthly_limit: number;
  used_today: number;
  daily_limit: number;
  max_source_chars: number;
}

// ---------------------------------------------------------------------------
// Placeholder heuristic (no API key configured)
// ---------------------------------------------------------------------------

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

function generatePlaceholder(chunks: ChunkRow[]): DraftConcept[] {
  return chunks.map((chunk) => {
    const first = splitSentences(chunk.text)[0] ?? chunk.text;
    const name = first.length > 60 ? `${first.slice(0, 57)}...` : first;
    const explanation = chunk.text.trim();
    const clozeWord = pickClozeWord(first);
    const item: DraftItem =
      clozeWord != null
        ? { prompt: first.replace(clozeWord, '_____'), answer: clozeWord, item_type: 'cloze' }
        : { prompt: `In your own words, explain: ${name}`, answer: explanation, item_type: 'explain_back' };
    return { name, explanation, chunkIds: [chunk.id], items: [item] };
  });
}

// ---------------------------------------------------------------------------
// Handler
// ---------------------------------------------------------------------------

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

  const supabase = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_ANON_KEY')!, {
    global: { headers: { Authorization: authHeader } },
  });

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
  // rather than trusting a client-supplied goal_id.
  const { data: source, error: sourceError } = await supabase
    .from('sources')
    .select('id, goal_id')
    .eq('id', body.source_id)
    .single();
  if (sourceError || !source) {
    return jsonResponse({ error: 'source_not_found' }, 404);
  }
  const goalId = source.goal_id as string;

  const apiKey = Deno.env.get('ANTHROPIC_API_KEY');
  const model = Deno.env.get('PALY_GENERATION_MODEL') || 'claude-sonnet-5-5';
  const provider = apiKey ? `anthropic:${model}` : 'stub-heuristic';
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
        provider,
        attempt_count: 1,
        error_code: null,
        completed_at: null,
      },
      { onConflict: 'user_id,idempotency_key' }
    )
    .select()
    .single();

  if (jobError || !job) {
    return jsonResponse({ error: jobError?.message ?? 'job_create_failed' }, 500);
  }

  // Credit bookkeeping only. Never used to read or write study content.
  const admin = createClient(Deno.env.get('SUPABASE_URL')!, Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!);
  let usageId: string | null = null;

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

    // Generate first, so a failed call never deletes the learner's previous drafts.
    let drafts: DraftConcept[];
    let truncated = false;
    let usage: ClaimResult | null = null;
    if (apiKey) {
      const totalChars = chunks.reduce((n: number, c: ChunkRow) => n + c.text.length, 0);
      const { data: claim, error: claimError } = await admin.rpc('claim_generation', {
        p_user: userId,
        p_source: body.source_id,
        p_input_chars: totalChars,
      });
      if (claimError) throw new Error(`usage_check_failed: ${claimError.message}`);
      usage = claim as ClaimResult;

      if (!usage.allowed) {
        await supabase
          .from('ai_jobs')
          .update({
            status: 'failed',
            error_code: `limit_reached_${usage.reason}`,
            completed_at: new Date().toISOString(),
          })
          .eq('id', job.id);
        return jsonResponse({ error: 'limit_reached', reason: usage.reason, usage }, 429);
      }
      usageId = usage.usage_id;

      const result = await generateWithClaude(chunks, apiKey, model, usage.max_source_chars);
      drafts = result.drafts;
      truncated = result.truncated;
    } else {
      drafts = generatePlaceholder(chunks);
    }

    // Retry-without-duplicates: clear previously generated *draft* concepts and
    // items tied to this source before inserting the new set. Published items
    // (and their review history) are never touched.
    const chunkIds = chunks.map((c: ChunkRow) => c.id);
    const { data: staleLinks } = await supabase.from('concept_sources').select('concept_id').in('chunk_id', chunkIds);
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

    const { data: insertedConcepts, error: conceptError } = await supabase
      .from('concepts')
      .insert(drafts.map((d) => ({ goal_id: goalId, name: d.name, explanation: d.explanation, state: 'new' })))
      .select();
    if (conceptError) throw new Error(conceptError.message);

    const { error: linkError } = await supabase.from('concept_sources').insert(
      insertedConcepts.flatMap((concept, i) =>
        drafts[i].chunkIds.map((chunkId) => ({ concept_id: concept.id, chunk_id: chunkId, relevance: 1 }))
      )
    );
    if (linkError) throw new Error(linkError.message);

    const flatItems = drafts.flatMap((d, conceptIndex) => d.items.map((item) => ({ item, conceptIndex })));
    const { data: insertedItems, error: itemError } = await supabase
      .from('study_items')
      .insert(
        flatItems.map(({ item }) => ({
          goal_id: goalId,
          prompt: item.prompt,
          answer: item.answer,
          item_type: item.item_type,
          origin: 'ai',
          status: 'draft',
        }))
      )
      .select();
    if (itemError) throw new Error(itemError.message);

    const { error: itemConceptError } = await supabase.from('item_concepts').insert(
      insertedItems.map((item, i) => ({
        item_id: item.id,
        concept_id: insertedConcepts[flatItems[i].conceptIndex].id,
        weight: 1,
      }))
    );
    if (itemConceptError) throw new Error(itemConceptError.message);

    await supabase
      .from('ai_jobs')
      .update({ status: 'succeeded', completed_at: new Date().toISOString() })
      .eq('id', job.id);
    if (usageId) await admin.rpc('finish_generation', { p_usage_id: usageId, p_success: true });

    return jsonResponse(
      { job_id: job.id, concepts: insertedConcepts, items: insertedItems, truncated, usage },
      200
    );
  } catch (err) {
    // Hand the credit back: the learner got nothing for it.
    if (usageId) await admin.rpc('finish_generation', { p_usage_id: usageId, p_success: false });

    await supabase
      .from('ai_jobs')
      .update({
        status: 'failed',
        error_code: err instanceof Error ? err.message.slice(0, 200) : 'unknown_error',
        completed_at: new Date().toISOString(),
      })
      .eq('id', job.id);

    return jsonResponse({ error: err instanceof Error ? err.message : 'unknown_error' }, 500);
  }
});
