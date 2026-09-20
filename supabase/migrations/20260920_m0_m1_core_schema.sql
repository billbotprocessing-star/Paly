-- Enums
create type goal_mode as enum ('exam', 'explore');
create type goal_status as enum ('active', 'archived', 'completed');
create type source_type as enum ('text', 'photo', 'pdf');
create type source_status as enum ('pending', 'ingested', 'failed');
create type concept_state as enum ('new', 'learning', 'holding', 'strong');
create type item_type as enum ('short_answer', 'cloze', 'explain_back');
create type item_origin as enum ('ai', 'user');
create type item_status as enum ('draft', 'published', 'archived');
create type ai_job_type as enum ('INGEST_SOURCE', 'GENERATE_SET', 'TUTOR_TURN', 'SESSION_RECAP', 'REBUILD_PLAN');
create type ai_job_status as enum ('queued', 'running', 'succeeded', 'failed');

-- profiles: learner settings, keyed on auth.users.id
create table profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text,
  timezone text not null default 'UTC',
  locale text not null default 'en',
  preferences_json jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- learning_goals: Exam or Explore container
create table learning_goals (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  mode goal_mode not null,
  title text not null,
  subject text,
  exam_at timestamptz,
  cadence text,
  status goal_status not null default 'active',
  created_at timestamptz not null default now()
);
create index learning_goals_user_id_idx on learning_goals(user_id);

-- sources: uploaded or pasted learning material (text-only path for M1)
create table sources (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references learning_goals(id) on delete cascade,
  type source_type not null default 'text',
  title text,
  storage_path text,
  raw_text text,
  status source_status not null default 'pending',
  page_count int,
  created_at timestamptz not null default now()
);
create index sources_goal_id_idx on sources(goal_id);

-- source_chunks: retrieval units with stable provenance
create table source_chunks (
  id uuid primary key default gen_random_uuid(),
  source_id uuid not null references sources(id) on delete cascade,
  ordinal int not null,
  text text not null,
  page_ref text,
  checksum text,
  created_at timestamptz not null default now(),
  unique (source_id, ordinal)
);
create index source_chunks_source_id_idx on source_chunks(source_id);

-- concepts: canonical knowledge units
create table concepts (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references learning_goals(id) on delete cascade,
  name text not null,
  explanation text not null,
  state concept_state not null default 'new',
  archived_at timestamptz,
  created_at timestamptz not null default now()
);
create index concepts_goal_id_idx on concepts(goal_id);

-- concept_sources: evidence links for explanations (lineage rule)
create table concept_sources (
  concept_id uuid not null references concepts(id) on delete cascade,
  chunk_id uuid not null references source_chunks(id) on delete cascade,
  relevance real,
  primary key (concept_id, chunk_id)
);
create index concept_sources_chunk_id_idx on concept_sources(chunk_id);

-- study_items: editable recall prompts
create table study_items (
  id uuid primary key default gen_random_uuid(),
  goal_id uuid not null references learning_goals(id) on delete cascade,
  prompt text not null,
  answer text not null,
  item_type item_type not null default 'short_answer',
  origin item_origin not null default 'ai',
  status item_status not null default 'draft',
  created_at timestamptz not null default now()
);
create index study_items_goal_id_idx on study_items(goal_id);

-- item_concepts: many-to-many skill mapping
create table item_concepts (
  item_id uuid not null references study_items(id) on delete cascade,
  concept_id uuid not null references concepts(id) on delete cascade,
  weight real not null default 1,
  primary key (item_id, concept_id)
);
create index item_concepts_concept_id_idx on item_concepts(concept_id);

-- ai_jobs: async job record for the server-boundary -> (future n8n) -> Supabase pipeline
create table ai_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type ai_job_type not null,
  entity_id uuid,
  idempotency_key text not null,
  status ai_job_status not null default 'queued',
  attempt_count int not null default 0,
  provider text,
  error_code text,
  requested_at timestamptz not null default now(),
  completed_at timestamptz,
  unique (user_id, idempotency_key)
);
create index ai_jobs_user_id_idx on ai_jobs(user_id);
