alter table profiles enable row level security;
alter table learning_goals enable row level security;
alter table sources enable row level security;
alter table source_chunks enable row level security;
alter table concepts enable row level security;
alter table concept_sources enable row level security;
alter table study_items enable row level security;
alter table item_concepts enable row level security;
alter table ai_jobs enable row level security;

-- profiles: direct ownership
create policy "profiles_select_own" on profiles for select using (user_id = auth.uid());
create policy "profiles_insert_own" on profiles for insert with check (user_id = auth.uid());
create policy "profiles_update_own" on profiles for update using (user_id = auth.uid());
create policy "profiles_delete_own" on profiles for delete using (user_id = auth.uid());

-- learning_goals: direct ownership
create policy "goals_select_own" on learning_goals for select using (user_id = auth.uid());
create policy "goals_insert_own" on learning_goals for insert with check (user_id = auth.uid());
create policy "goals_update_own" on learning_goals for update using (user_id = auth.uid());
create policy "goals_delete_own" on learning_goals for delete using (user_id = auth.uid());

-- sources: ownership via learning_goals
create policy "sources_select_own" on sources for select using (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = auth.uid())
);
create policy "sources_insert_own" on sources for insert with check (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = auth.uid())
);
create policy "sources_update_own" on sources for update using (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = auth.uid())
);
create policy "sources_delete_own" on sources for delete using (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = auth.uid())
);

-- source_chunks: ownership via sources -> learning_goals
create policy "chunks_select_own" on source_chunks for select using (
  exists (
    select 1 from sources s
    join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = auth.uid()
  )
);
create policy "chunks_insert_own" on source_chunks for insert with check (
  exists (
    select 1 from sources s
    join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = auth.uid()
  )
);
create policy "chunks_update_own" on source_chunks for update using (
  exists (
    select 1 from sources s
    join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = auth.uid()
  )
);
create policy "chunks_delete_own" on source_chunks for delete using (
  exists (
    select 1 from sources s
    join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = auth.uid()
  )
);

-- concepts: ownership via learning_goals
create policy "concepts_select_own" on concepts for select using (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = auth.uid())
);
create policy "concepts_insert_own" on concepts for insert with check (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = auth.uid())
);
create policy "concepts_update_own" on concepts for update using (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = auth.uid())
);
create policy "concepts_delete_own" on concepts for delete using (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = auth.uid())
);

-- concept_sources: ownership via concepts -> learning_goals
create policy "concept_sources_select_own" on concept_sources for select using (
  exists (
    select 1 from concepts c
    join learning_goals g on g.id = c.goal_id
    where c.id = concept_sources.concept_id and g.user_id = auth.uid()
  )
);
create policy "concept_sources_insert_own" on concept_sources for insert with check (
  exists (
    select 1 from concepts c
    join learning_goals g on g.id = c.goal_id
    where c.id = concept_sources.concept_id and g.user_id = auth.uid()
  )
);
create policy "concept_sources_delete_own" on concept_sources for delete using (
  exists (
    select 1 from concepts c
    join learning_goals g on g.id = c.goal_id
    where c.id = concept_sources.concept_id and g.user_id = auth.uid()
  )
);

-- study_items: ownership via learning_goals
create policy "items_select_own" on study_items for select using (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = auth.uid())
);
create policy "items_insert_own" on study_items for insert with check (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = auth.uid())
);
create policy "items_update_own" on study_items for update using (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = auth.uid())
);
create policy "items_delete_own" on study_items for delete using (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = auth.uid())
);

-- item_concepts: ownership via study_items -> learning_goals
create policy "item_concepts_select_own" on item_concepts for select using (
  exists (
    select 1 from study_items i
    join learning_goals g on g.id = i.goal_id
    where i.id = item_concepts.item_id and g.user_id = auth.uid()
  )
);
create policy "item_concepts_insert_own" on item_concepts for insert with check (
  exists (
    select 1 from study_items i
    join learning_goals g on g.id = i.goal_id
    where i.id = item_concepts.item_id and g.user_id = auth.uid()
  )
);
create policy "item_concepts_delete_own" on item_concepts for delete using (
  exists (
    select 1 from study_items i
    join learning_goals g on g.id = i.goal_id
    where i.id = item_concepts.item_id and g.user_id = auth.uid()
  )
);

-- ai_jobs: direct ownership
create policy "ai_jobs_select_own" on ai_jobs for select using (user_id = auth.uid());
create policy "ai_jobs_insert_own" on ai_jobs for insert with check (user_id = auth.uid());
create policy "ai_jobs_update_own" on ai_jobs for update using (user_id = auth.uid());

-- auto-create a profile row when a new auth user signs up
create function handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (user_id, display_name)
  values (new.id, new.raw_user_meta_data ->> 'display_name');
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function handle_new_user();
