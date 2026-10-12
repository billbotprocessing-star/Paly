# Paly — Supabase backend

Project: `paly` (ref `vcnhffafeqkvjgokyych`, `us-east-1`).

## What's here

- `migrations/` — the Milestone 0+1 schema: `profiles`, `learning_goals`,
  `sources`, `source_chunks`, `concepts`, `concept_sources`, `study_items`,
  `item_concepts`, `ai_jobs`, all with row-level security scoped to
  `auth.uid()` via `learning_goals.user_id`, plus a private `sources`
  storage bucket and the `handle_new_user` trigger that creates a
  `profiles` row on signup.
  Milestone 2 adds `memory_states`, `study_sessions`, `reviews` (immutable)
  and the `record_review` RPC, which writes a review and the item's new
  schedule in one transaction.
- `functions/generate-set/` — the `GENERATE_SET` job: the trusted server
  boundary the mobile app calls with the user's own JWT (never a
  service-role key). It reads `source_chunks` and asks Claude for concepts
  and recall prompts, each tied to the passage it came from; output is
  validated (`validate.ts`) before anything is written. With no
  `ANTHROPIC_API_KEY` set it falls back to a placeholder heuristic.
- `tests/` — database security tests run against an in-memory Postgres.

## Secrets (Dashboard → Edge Functions → Secrets)

| Name | Required | Purpose |
|------|----------|---------|
| `ANTHROPIC_API_KEY` | yes, for real generation | Claude API key |
| `PALY_GENERATION_MODEL` | no | Defaults to `claude-sonnet-5-5`; set `claude-haiku-5-5` to cut cost |

Also set a monthly **spend limit** in the Anthropic Console as a backstop
behind the per-user limits below.

## AI usage limits

Each Claude generation costs money, so every learner has an allowance:

| Plan | Per month | Per day | Max characters per source |
|------|-----------|---------|---------------------------|
| free | 5 | 3 | 15,000 |
| pro | 150 | 30 | 60,000 |

- Enforced in `generate-set` before Claude is called (`claim_generation`,
  callable only with the service role). Over the limit → HTTP 429 with the
  learner's usage; the source stays saved and can be generated later.
- A failed generation hands the credit back. Placeholder generation (no
  API key) is free. Longer sources are cut to the plan's size limit.
- Learners can read their own plan and usage (`get_my_usage()`), never
  change them.

Change the limits (takes effect immediately, no deploy):

```sql
update plan_limits set monthly_generations = 10, daily_generations = 5 where plan = 'free';
```

Give someone Pro (until payments are wired up):

```sql
insert into user_plans (user_id, plan, current_period_end)
values ('<auth user id>', 'pro', now() + interval '1 month')
on conflict (user_id) do update set plan = excluded.plan,
  current_period_end = excluded.current_period_end, updated_at = now();
```

A lapsed `current_period_end` falls back to free automatically.

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

## Tests

```bash
cd tests && npm install && npm test
```

## Not built yet (see Paly MVP Spec)

`study_plans`, `plan_items` (Milestone 4) and `tutor_threads`,
`tutor_messages`, `message_citations` (Milestone 3).
