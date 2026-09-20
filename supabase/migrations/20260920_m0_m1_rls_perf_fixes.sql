-- missing covering indexes for FKs
create index concept_sources_chunk_id_idx on concept_sources(chunk_id);
create index item_concepts_concept_id_idx on item_concepts(concept_id);

-- re-create policies with (select auth.uid()) so it's evaluated once per query, not per row
drop policy profiles_select_own on profiles;
drop policy profiles_insert_own on profiles;
drop policy profiles_update_own on profiles;
drop policy profiles_delete_own on profiles;
create policy "profiles_select_own" on profiles for select using (user_id = (select auth.uid()));
create policy "profiles_insert_own" on profiles for insert with check (user_id = (select auth.uid()));
create policy "profiles_update_own" on profiles for update using (user_id = (select auth.uid()));
create policy "profiles_delete_own" on profiles for delete using (user_id = (select auth.uid()));

drop policy goals_select_own on learning_goals;
drop policy goals_insert_own on learning_goals;
drop policy goals_update_own on learning_goals;
drop policy goals_delete_own on learning_goals;
create policy "goals_select_own" on learning_goals for select using (user_id = (select auth.uid()));
create policy "goals_insert_own" on learning_goals for insert with check (user_id = (select auth.uid()));
create policy "goals_update_own" on learning_goals for update using (user_id = (select auth.uid()));
create policy "goals_delete_own" on learning_goals for delete using (user_id = (select auth.uid()));

drop policy sources_select_own on sources;
drop policy sources_insert_own on sources;
drop policy sources_update_own on sources;
drop policy sources_delete_own on sources;
create policy "sources_select_own" on sources for select using (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = (select auth.uid()))
);
create policy "sources_insert_own" on sources for insert with check (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = (select auth.uid()))
);
create policy "sources_update_own" on sources for update using (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = (select auth.uid()))
);
create policy "sources_delete_own" on sources for delete using (
  exists (select 1 from learning_goals g where g.id = sources.goal_id and g.user_id = (select auth.uid()))
);

drop policy chunks_select_own on source_chunks;
drop policy chunks_insert_own on source_chunks;
drop policy chunks_update_own on source_chunks;
drop policy chunks_delete_own on source_chunks;
create policy "chunks_select_own" on source_chunks for select using (
  exists (
    select 1 from sources s join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = (select auth.uid())
  )
);
create policy "chunks_insert_own" on source_chunks for insert with check (
  exists (
    select 1 from sources s join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = (select auth.uid())
  )
);
create policy "chunks_update_own" on source_chunks for update using (
  exists (
    select 1 from sources s join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = (select auth.uid())
  )
);
create policy "chunks_delete_own" on source_chunks for delete using (
  exists (
    select 1 from sources s join learning_goals g on g.id = s.goal_id
    where s.id = source_chunks.source_id and g.user_id = (select auth.uid())
  )
);

drop policy concepts_select_own on concepts;
drop policy concepts_insert_own on concepts;
drop policy concepts_update_own on concepts;
drop policy concepts_delete_own on concepts;
create policy "concepts_select_own" on concepts for select using (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = (select auth.uid()))
);
create policy "concepts_insert_own" on concepts for insert with check (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = (select auth.uid()))
);
create policy "concepts_update_own" on concepts for update using (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = (select auth.uid()))
);
create policy "concepts_delete_own" on concepts for delete using (
  exists (select 1 from learning_goals g where g.id = concepts.goal_id and g.user_id = (select auth.uid()))
);

drop policy concept_sources_select_own on concept_sources;
drop policy concept_sources_insert_own on concept_sources;
drop policy concept_sources_delete_own on concept_sources;
create policy "concept_sources_select_own" on concept_sources for select using (
  exists (
    select 1 from concepts c join learning_goals g on g.id = c.goal_id
    where c.id = concept_sources.concept_id and g.user_id = (select auth.uid())
  )
);
create policy "concept_sources_insert_own" on concept_sources for insert with check (
  exists (
    select 1 from concepts c join learning_goals g on g.id = c.goal_id
    where c.id = concept_sources.concept_id and g.user_id = (select auth.uid())
  )
);
create policy "concept_sources_delete_own" on concept_sources for delete using (
  exists (
    select 1 from concepts c join learning_goals g on g.id = c.goal_id
    where c.id = concept_sources.concept_id and g.user_id = (select auth.uid())
  )
);

drop policy items_select_own on study_items;
drop policy items_insert_own on study_items;
drop policy items_update_own on study_items;
drop policy items_delete_own on study_items;
create policy "items_select_own" on study_items for select using (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = (select auth.uid()))
);
create policy "items_insert_own" on study_items for insert with check (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = (select auth.uid()))
);
create policy "items_update_own" on study_items for update using (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = (select auth.uid()))
);
create policy "items_delete_own" on study_items for delete using (
  exists (select 1 from learning_goals g where g.id = study_items.goal_id and g.user_id = (select auth.uid()))
);

drop policy item_concepts_select_own on item_concepts;
drop policy item_concepts_insert_own on item_concepts;
drop policy item_concepts_delete_own on item_concepts;
create policy "item_concepts_select_own" on item_concepts for select using (
  exists (
    select 1 from study_items i join learning_goals g on g.id = i.goal_id
    where i.id = item_concepts.item_id and g.user_id = (select auth.uid())
  )
);
create policy "item_concepts_insert_own" on item_concepts for insert with check (
  exists (
    select 1 from study_items i join learning_goals g on g.id = i.goal_id
    where i.id = item_concepts.item_id and g.user_id = (select auth.uid())
  )
);
create policy "item_concepts_delete_own" on item_concepts for delete using (
  exists (
    select 1 from study_items i join learning_goals g on g.id = i.goal_id
    where i.id = item_concepts.item_id and g.user_id = (select auth.uid())
  )
);

drop policy ai_jobs_select_own on ai_jobs;
drop policy ai_jobs_insert_own on ai_jobs;
drop policy ai_jobs_update_own on ai_jobs;
create policy "ai_jobs_select_own" on ai_jobs for select using (user_id = (select auth.uid()));
create policy "ai_jobs_insert_own" on ai_jobs for insert with check (user_id = (select auth.uid()));
create policy "ai_jobs_update_own" on ai_jobs for update using (user_id = (select auth.uid()));
