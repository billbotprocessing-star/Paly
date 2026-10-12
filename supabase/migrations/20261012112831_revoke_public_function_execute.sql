-- Postgres grants EXECUTE on new functions to PUBLIC, which every role
-- (including anon) inherits, so revoking from anon alone does nothing.
-- Revoke from PUBLIC, then grant back only what the app needs.

-- Trigger function: only ever fired by the on_auth_user_created trigger.
-- Triggers don't check EXECUTE when they fire, so sign-up is unaffected.
revoke execute on function public.handle_new_user() from public, anon, authenticated;

revoke execute on function public.record_review(uuid, uuid, review_rating, smallint, int, text, real, real, timestamptz) from public, anon;
grant execute on function public.record_review(uuid, uuid, review_rating, smallint, int, text, real, real, timestamptz) to authenticated;
