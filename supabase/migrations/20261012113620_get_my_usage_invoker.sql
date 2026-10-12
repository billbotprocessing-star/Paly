-- get_my_usage only reads rows the caller can already see under RLS
-- (their own user_plans/ai_usage rows and the public plan_limits), so it
-- runs with the caller's own permissions instead of elevated ones.
create or replace function public.get_my_usage()
returns jsonb
language plpgsql
stable
security invoker
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

  select coalesce(
    (select plan from user_plans
      where user_id = v_uid and (current_period_end is null or current_period_end > now())),
    'free'::plan_tier
  ) into v_plan;
  select * into v_limits from plan_limits where plan = v_plan;

  select
    count(*) filter (where created_at >= date_trunc('month', now() at time zone 'utc') at time zone 'utc')::int,
    count(*) filter (where created_at >= date_trunc('day', now() at time zone 'utc') at time zone 'utc')::int
  into v_used_month, v_used_today
  from ai_usage
  where user_id = v_uid
    and job_type = 'GENERATE_SET'
    and (status = 'succeeded' or (status = 'pending' and created_at > now() - interval '15 minutes'));

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

revoke execute on function public.get_my_usage() from public, anon;
grant execute on function public.get_my_usage() to authenticated;
