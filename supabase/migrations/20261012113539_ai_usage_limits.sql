-- AI usage limits: every Claude call costs money, so each learner gets an
-- allowance based on their plan. Limits live in plan_limits so they can be
-- tuned with a single UPDATE, no redeploy.
--
-- Trust boundary: learners can READ their plan and usage, never write them.
-- Credits are claimed and settled only by the generate-set edge function,
-- using the service role, through claim_generation() / finish_generation().

create type plan_tier as enum ('free', 'pro');
create type usage_status as enum ('pending', 'succeeded', 'failed');

create table plan_limits (
  plan plan_tier primary key,
  monthly_generations int not null check (monthly_generations >= 0),
  daily_generations int not null check (daily_generations >= 0),
  max_source_chars int not null check (max_source_chars > 0)
);
insert into plan_limits (plan, monthly_generations, daily_generations, max_source_chars) values
  ('free', 5, 3, 15000),
  ('pro', 150, 30, 60000);

-- A learner's plan. No row = free. Written by an admin today, by a payment
-- webhook (e.g. App Store subscriptions) later. A lapsed period falls back to free.
create table user_plans (
  user_id uuid primary key references auth.users(id) on delete cascade,
  plan plan_tier not null default 'free',
  current_period_end timestamptz,
  updated_at timestamptz not null default now()
);

-- One row per paid AI call. 'failed' rows never count against the allowance.
create table ai_usage (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  job_type ai_job_type not null,
  source_id uuid references sources(id) on delete set null,
  input_chars int not null default 0,
  status usage_status not null default 'pending',
  created_at timestamptz not null default now(),
  completed_at timestamptz
);
create index ai_usage_user_created_idx on ai_usage(user_id, created_at);
create index ai_usage_source_id_idx on ai_usage(source_id);

alter table plan_limits enable row level security;
alter table user_plans enable row level security;
alter table ai_usage enable row level security;

-- Read-only for learners. No insert/update/delete policies on purpose.
create policy "plan_limits_read" on plan_limits for select to authenticated using (true);
create policy "user_plans_select_own" on user_plans for select using (user_id = (select auth.uid()));
create policy "ai_usage_select_own" on ai_usage for select using (user_id = (select auth.uid()));

-- The plan a user is on right now.
create or replace function public.effective_plan(p_user uuid)
returns plan_tier
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(
    (select plan from user_plans
      where user_id = p_user and (current_period_end is null or current_period_end > now())),
    'free'::plan_tier
  );
$$;

-- Usage that counts: finished successfully, or still in flight (a pending
-- claim older than 15 minutes is treated as abandoned).
create or replace function public.usage_counts(p_user uuid)
returns table (used_month int, used_today int)
language sql
stable
security definer
set search_path = public
as $$
  select
    count(*) filter (where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc')::int,
    count(*) filter (where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::int
  from ai_usage
  where user_id = p_user
    and job_type = 'GENERATE_SET'
    and (status = 'succeeded' or (status = 'pending' and created_at > now() - interval '15 minutes'));
$$;

-- Atomically check the allowance and reserve one credit. A per-user lock
-- stops parallel requests from both squeezing past the last credit.
create or replace function public.claim_generation(p_user uuid, p_source uuid, p_input_chars int)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_plan plan_tier;
  v_limits plan_limits;
  v_used_month int;
  v_used_today int;
  v_usage_id uuid;
  v_reason text;
begin
  perform pg_advisory_xact_lock(hashtextextended('ai_usage:' || p_user::text, 0));

  v_plan := effective_plan(p_user);
  select * into v_limits from plan_limits where plan = v_plan;
  select used_month, used_today into v_used_month, v_used_today from usage_counts(p_user);

  if v_used_month >= v_limits.monthly_generations then
    v_reason := 'monthly';
  elsif v_used_today >= v_limits.daily_generations then
    v_reason := 'daily';
  end if;

  if v_reason is null then
    insert into ai_usage (user_id, job_type, source_id, input_chars)
    values (p_user, 'GENERATE_SET', p_source, least(p_input_chars, v_limits.max_source_chars))
    returning id into v_usage_id;
    v_used_month := v_used_month + 1;
    v_used_today := v_used_today + 1;
  end if;

  return jsonb_build_object(
    'allowed', v_reason is null,
    'reason', v_reason,
    'usage_id', v_usage_id,
    'plan', v_plan,
    'used_month', v_used_month,
    'monthly_limit', v_limits.monthly_generations,
    'used_today', v_used_today,
    'daily_limit', v_limits.daily_generations,
    'max_source_chars', v_limits.max_source_chars
  );
end;
$$;

-- Settle a claim. A failed generation hands the credit back.
create or replace function public.finish_generation(p_usage_id uuid, p_success boolean)
returns void
language sql
security definer
set search_path = public
as $$
  update ai_usage
     set status = case when p_success then 'succeeded'::usage_status else 'failed'::usage_status end,
         completed_at = now()
   where id = p_usage_id and status = 'pending';
$$;

-- What the app shows: "3 of 5 left this month".
create or replace function public.get_my_usage()
returns jsonb
language plpgsql
stable
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_plan plan_tier;
  v_limits plan_limits;
  v_used_month int;
  v_used_today int;
begin
  if v_uid is null then
    raise exception 'not_authenticated';
  end if;
  v_plan := effective_plan(v_uid);
  select * into v_limits from plan_limits where plan = v_plan;
  select used_month, used_today into v_used_month, v_used_today from usage_counts(v_uid);
  return jsonb_build_object(
    'plan', v_plan,
    'used_month', v_used_month,
    'monthly_limit', v_limits.monthly_generations,
    'used_today', v_used_today,
    'daily_limit', v_limits.daily_generations,
    'max_source_chars', v_limits.max_source_chars,
    'resets_at', (date_trunc('month', now() at time zone 'utc') + interval '1 month') at time zone 'utc'
  );
end;
$$;

-- Lock down: learners may only call get_my_usage. Claiming and settling
-- credits is server-only.
revoke execute on function public.effective_plan(uuid) from public, anon, authenticated;
revoke execute on function public.usage_counts(uuid) from public, anon, authenticated;
revoke execute on function public.claim_generation(uuid, uuid, int) from public, anon, authenticated;
revoke execute on function public.finish_generation(uuid, boolean) from public, anon, authenticated;
revoke execute on function public.get_my_usage() from public, anon;
grant execute on function public.effective_plan(uuid) to service_role;
grant execute on function public.usage_counts(uuid) to service_role;
grant execute on function public.claim_generation(uuid, uuid, int) to service_role;
grant execute on function public.finish_generation(uuid, boolean) to service_role;
grant execute on function public.get_my_usage() to authenticated;
