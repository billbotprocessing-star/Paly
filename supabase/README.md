# Paly — Supabase backend

Project: `paly` (ref `vcnhffafeqkvjgokyych`, `us-east-1`).

## What's here

- `migrations/` — the Milestone 0+1 schema: `profiles`, `learning_goals`,
  `sources`, `source_chunks`, `concepts`, `concept_sources`, `study_items`,
  `item_concepts`, `ai_jobs`, all with row-level security scoped to
  `auth.uid()` via `learning_goals.user_id`, plus a private `sources`
  storage bucket and the `handle_new_user` trigger that creates a
  `profiles` row on signup.
- `functions/generate-set/` — the `GENERATE_SET` job: the trusted server
  boundary the mobile app calls with the user's own JWT (never a
  service-role key). It reads `source_chunks`, and for now runs a
  placeholder heuristic (one concept + one cloze item per chunk) so the
  capture → generate → review loop works end to end. Swap the extraction
  logic for a call to the real n8n `GENERATE_SET` webhook later — the
  `ai_jobs` contract (idempotency key, status transitions, retry-without-
  duplicates) doesn't change.

## Applying migrations to a fresh project

```bash
supabase login
supabase link --project-ref vcnhffafeqkvjgokyych
supabase db push
```

## Deploying the edge function

```bash
supabase functions deploy generate-set --project-ref vcnhffafeqkvjgokyych
```

## Not built yet (see Paly MVP Spec)

`reviews`, `memory_states`, `study_sessions`, `study_plans`, `plan_items`,
`tutor_threads`, `tutor_messages`, `message_citations` — these land with
Milestone 2 (Recall/scheduling) and Milestone 3 (Tutor).
