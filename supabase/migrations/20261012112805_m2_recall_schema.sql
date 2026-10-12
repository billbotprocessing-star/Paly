-- Milestone 2 · Recall (Paly MVP Spec, "Supabase data model").
-- memory_states: current scheduler state per item (one row per item).
-- study_sessions: one sitting of review.
-- reviews: immutable recall events. No update/delete policies, so a
--          learner's history can only grow.

create type review_rating as enum ('again', 'hard', 'good', 'easy');
create type session_mode as enum ('daily', 'goal');

create table memory_states (
  item_id uuid primary key references study_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  difficulty real not null,
  stability real not null,
  due_at timestamptz not null,
  last_review_at timestamptz not null,
  reps int not null default 0,
  lapses int not null default 0
);
create index memory_states_user_due_idx on memory_states(user_id, due_at);

create table study_sessions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  goal_id uuid references learning_goals(id) on delete cascade,
  mode session_mode not null default 'daily',
  planned_minutes int,
  started_at timestamptz not null default now(),
  ended_at timestamptz
);
create index study_sessions_user_id_idx on study_sessions(user_id);
create index study_sessions_goal_id_idx on study_sessions(goal_id);

create table reviews (
  id uuid primary key default gen_random_uuid(),
  session_id uuid not null references study_sessions(id) on delete cascade,
  item_id uuid not null references study_items(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  result review_rating not null,
  confidence smallint check (confidence between 1 and 3),
  response_ms int check (response_ms >= 0),
  answer_text text,
  reviewed_at timestamptz not null default now()
);
create index reviews_item_id_idx on reviews(item_id);
create index reviews_session_id_idx on reviews(session_id);
create index reviews_user_id_idx on reviews(user_id);

alter table memory_states enable row level security;
alter table study_sessions enable row level security;
alter table reviews enable row level security;

-- A learner may only touch rows that are theirs AND point at items/goals they own.
create policy "memory_states_select_own" on memory_states for select using (user_id = (select auth.uid()));
create policy "memory_states_insert_own" on memory_states for insert with check (
  user_id = (select auth.uid())
  and exists (
    select 1 from study_items i join learning_goals g on g.id = i.goal_id
    where i.id = memory_states.item_id and g.user_id = (select auth.uid())
  )
);
create policy "memory_states_update_own" on memory_states for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "study_sessions_select_own" on study_sessions for select using (user_id = (select auth.uid()));
create policy "study_sessions_insert_own" on study_sessions for insert with check (
  user_id = (select auth.uid())
  and (
    goal_id is null
    or exists (select 1 from learning_goals g where g.id = study_sessions.goal_id and g.user_id = (select auth.uid()))
  )
);
create policy "study_sessions_update_own" on study_sessions for update
  using (user_id = (select auth.uid()))
  with check (user_id = (select auth.uid()));

create policy "reviews_select_own" on reviews for select using (user_id = (select auth.uid()));
create policy "reviews_insert_own" on reviews for insert with check (
  user_id = (select auth.uid())
  and exists (select 1 from study_sessions s where s.id = reviews.session_id and s.user_id = (select auth.uid()))
  and exists (
    select 1 from study_items i join learning_goals g on g.id = i.goal_id
    where i.id = reviews.item_id and g.user_id = (select auth.uid())
  )
);

-- Record one answer atomically: append the immutable review and move the
-- item's scheduler state in the same transaction. Runs as the caller
-- (security invoker), so every write above is still checked by RLS.
-- The client computes the next state with the scheduler in lib/scheduler.ts.
create or replace function public.record_review(
  p_session_id uuid,
  p_item_id uuid,
  p_result review_rating,
  p_confidence smallint,
  p_response_ms int,
  p_answer_text text,
  p_difficulty real,
  p_stability real,
  p_due_at timestamptz
) returns void
language plpgsql
security invoker
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_now timestamptz := now();
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  if p_difficulty < 1 or p_difficulty > 10 or p_stability <= 0 then
    raise exception 'invalid_memory_state';
  end if;

  insert into reviews (session_id, item_id, user_id, result, confidence, response_ms, answer_text, reviewed_at)
  values (p_session_id, p_item_id, v_uid, p_result, p_confidence, p_response_ms, p_answer_text, v_now);

  insert into memory_states (item_id, user_id, difficulty, stability, due_at, last_review_at, reps, lapses)
  values (p_item_id, v_uid, p_difficulty, p_stability, p_due_at, v_now, 1, case when p_result = 'again' then 1 else 0 end)
  on conflict (item_id) do update set
    difficulty = excluded.difficulty,
    stability = excluded.stability,
    due_at = excluded.due_at,
    last_review_at = excluded.last_review_at,
    reps = memory_states.reps + 1,
    lapses = memory_states.lapses + case when p_result = 'again' then 1 else 0 end;
end;
$$;

revoke execute on function public.record_review(uuid, uuid, review_rating, smallint, int, text, real, real, timestamptz) from anon;
grant execute on function public.record_review(uuid, uuid, review_rating, smallint, int, text, real, real, timestamptz) to authenticated;
