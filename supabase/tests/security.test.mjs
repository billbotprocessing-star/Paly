// Database security tests. Run: cd supabase/tests && npm install && npm test
//
// Applies every Paly migration to an in-memory Postgres (PGlite) with a
// minimal stand-in for Supabase's auth/storage schemas, then checks:
//  - record_review is atomic and one learner can never read or write another
//    learner's study history; review history is append-only
//  - AI usage limits: daily/monthly allowances, refunds on failure, plan
//    upgrades/lapses, and that learners cannot forge plans or usage

import { PGlite } from '@electric-sql/pglite';
import { readdirSync, readFileSync } from 'node:fs';
import { join } from 'node:path';

const dir = process.argv[2] ?? new URL('../migrations', import.meta.url).pathname;
const db = new PGlite();

await db.exec(`
  create role anon nologin; create role authenticated nologin; create role service_role nologin bypassrls; alter default privileges grant execute on functions to public;
  create schema auth;
  create table auth.users (id uuid primary key, raw_user_meta_data jsonb default '{}');
  create function auth.uid() returns uuid language sql stable as
    $$ select nullif(current_setting('request.jwt.claim.sub', true), '')::uuid $$;
  create schema storage;
  create table storage.buckets (id text primary key, name text, public boolean);
  create table storage.objects (id uuid primary key default gen_random_uuid(), bucket_id text, name text);
  alter table storage.objects enable row level security;
  create function storage.foldername(name text) returns text[] language sql as $$ select string_to_array(name, '/') $$;
  grant usage on schema public, auth to anon, authenticated;
`);

const files = readdirSync(dir).filter((f) => f.endsWith('.sql')).sort(); // timestamp-prefixed = applied order
for (const f of files) {
  await db.exec(readFileSync(join(dir, f), 'utf8'));
  console.log('applied', f);
}
await db.exec(`
  grant select, insert, update, delete on all tables in schema public to authenticated;
  grant select, insert, update, delete on all tables in schema public to service_role;
`);

const A = '11111111-1111-1111-1111-111111111111';
const B = '22222222-2222-2222-2222-222222222222';
await db.exec(`insert into auth.users (id) values ('${A}'), ('${B}')`);

async function as(uid, sql, params = []) {
  await db.exec(`set role authenticated; select set_config('request.jwt.claim.sub', '${uid}', false);`);
  try {
    return await db.query(sql, params);
  } finally {
    await db.exec(`reset role;`);
  }
}
let failures = 0;
function check(name, ok) {
  console.log(ok ? 'PASS' : 'FAIL', name);
  if (!ok) failures++;
}
async function rejects(name, fn) {
  try {
    const r = await fn();
    check(name, r && r.affectedRows === 0);
  } catch {
    check(name, true);
  }
}

// Learner A sets up a goal, a published item and a session.
const goal = (await as(A, `insert into learning_goals (user_id, mode, title) values ($1, 'exam', 'Bio') returning id`, [A])).rows[0].id;
const item = (await as(A, `insert into study_items (goal_id, prompt, answer, status) values ($1, 'Q', 'A', 'published') returning id`, [goal])).rows[0].id;
const session = (await as(A, `insert into study_sessions (user_id, goal_id) values ($1, $2) returning id`, [A, goal])).rows[0].id;

const rr = `select record_review($1, $2, $3::review_rating, $4::smallint, $5, $6, $7::real, $8::real, $9::timestamptz)`;
await as(A, rr, [session, item, 'good', 3, 4200, 'A', 5, 3.2, '2026-10-15T00:00:00Z']);
await as(A, rr, [session, item, 'again', 1, 9000, null, 6.5, 0.8, '2026-10-12T00:10:00Z']);

const ms = (await as(A, `select reps, lapses, stability from memory_states where item_id = $1`, [item])).rows[0];
check('two answers -> reps 2, lapses 1, latest stability kept', ms.reps === 2 && ms.lapses === 1 && Math.abs(ms.stability - 0.8) < 1e-6);
check('two immutable review rows written', (await as(A, `select count(*)::int c from reviews where item_id = $1`, [item])).rows[0].c === 2);

// Learner B must see nothing of A's and be unable to write into it.
check('B cannot read A reviews', (await as(B, `select * from reviews`)).rows.length === 0);
check('B cannot read A memory states', (await as(B, `select * from memory_states`)).rows.length === 0);
check('B cannot read A sessions', (await as(B, `select * from study_sessions`)).rows.length === 0);
const bSession = (await as(B, `insert into study_sessions (user_id) values ($1) returning id`, [B])).rows[0].id;
await rejects('B cannot record a review on A item', () => as(B, rr, [bSession, item, 'easy', 3, 1, null, 3, 10, '2027-01-01T00:00:00Z']));
await rejects('B cannot log into A session', () => as(B, `insert into reviews (session_id, item_id, user_id, result) values ($1, $2, $3, 'good')`, [session, item, B]));
await rejects('B cannot spoof user_id on a session', () => as(B, `insert into study_sessions (user_id) values ($1)`, [A]));
await rejects('B cannot start a session on A goal', () => as(B, `insert into study_sessions (user_id, goal_id) values ($1, $2)`, [B, goal]));
await rejects('B cannot overwrite A memory state', () => as(B, `update memory_states set due_at = now() + interval '10 years' where item_id = $1`, [item]));

// Review history is append-only, even for its owner.
await rejects('A cannot edit a past review', () => as(A, `update reviews set result = 'easy' where item_id = $1`, [item]));
await rejects('A cannot delete a past review', () => as(A, `delete from reviews where item_id = $1`, [item]));
await rejects('bad scheduler values rejected', () => as(A, rr, [session, item, 'good', 3, 1, null, 42, 1, '2027-01-01T00:00:00Z']));
check('history unchanged after attempts', (await as(A, `select count(*)::int c from reviews`)).rows[0].c === 2);

// Anonymous callers get nothing.
await db.exec(`set role anon; select set_config('request.jwt.claim.sub', '', false);`);
let anonBlocked = false;
try { await db.query(rr, [session, item, 'good', 3, 1, null, 5, 3, '2027-01-01T00:00:00Z']); } catch { anonBlocked = true; }
await db.exec('reset role');
check('anon cannot call record_review', anonBlocked);

// ---------------- AI usage limits ----------------
async function asService(sql, params = []) {
  await db.exec(`set role service_role;`);
  try { return await db.query(sql, params); } finally { await db.exec('reset role'); }
}
const claim = async (uid, chars = 1000) => (await asService(`select claim_generation($1, null, $2) j`, [uid, chars])).rows[0].j;
const finish = (id, ok) => asService(`select finish_generation($1, $2)`, [id, ok]);

const c1 = await claim(A, 50000);
check('free plan: first claim allowed', c1.allowed && c1.plan === 'free' && c1.max_source_chars === 15000);
check('input chars recorded at the plan cap', (await asService(`select input_chars from ai_usage where id = $1`, [c1.usage_id])).rows[0].input_chars === 15000);
await finish(c1.usage_id, true);
const c2 = await claim(A); await finish(c2.usage_id, false);
check('failed generation hands the credit back', (await claim(A)).used_today === 2);
const c4 = await claim(A);
check('3rd successful-or-pending claim today allowed', c4.allowed && c4.used_today === 3);
const c5 = await claim(A);
check('4th claim today blocked by daily limit', !c5.allowed && c5.reason === 'daily' && c5.usage_id === null);

// Monthly limit: earlier-this-month usage counts toward the month, not today.
await db.exec(`insert into ai_usage (user_id, job_type, status, created_at)
  select '${B}', 'GENERATE_SET', 'succeeded', date_trunc('month', now()) + interval '1 minute' from generate_series(1, 5)`);
const b1 = await claim(B);
check('free plan: blocked after 5 this month', !b1.allowed && b1.reason === 'monthly');
await db.exec(`insert into user_plans (user_id, plan) values ('${B}', 'pro')`);
const b2 = await claim(B);
check('upgrading to pro unlocks more', b2.allowed && b2.plan === 'pro' && b2.monthly_limit === 150);
await db.exec(`update user_plans set current_period_end = now() - interval '1 day' where user_id = '${B}'`);
check('lapsed pro falls back to free', (await claim(B)).plan === 'free');

// Abandoned claims (>15 min pending) stop counting.
await db.exec(`update ai_usage set created_at = now() - interval '20 minutes' where user_id = '${A}' and status = 'pending'`);
check('abandoned pending claims expire', (await claim(A)).allowed);

// Learners can read but never forge.
const mine = (await as(A, `select get_my_usage() j`)).rows[0].j;
check('get_my_usage returns own plan + counts', mine.plan === 'free' && mine.daily_limit === 3 && mine.used_today === (await asService(`select used_today from usage_counts($1)`, [A])).rows[0].used_today);
check('A sees only own usage rows', (await as(A, `select distinct user_id from ai_usage`)).rows.every((r) => r.user_id === A));
await rejects('learner cannot grant self pro', () => as(A, `insert into user_plans (user_id, plan) values ($1, 'pro')`, [A]));
await rejects('learner cannot raise plan limits', () => as(A, `update plan_limits set monthly_generations = 99999`));
await rejects('learner cannot delete usage rows', () => as(A, `delete from ai_usage where user_id = $1`, [A]));
await rejects('learner cannot mark usage failed', () => as(A, `update ai_usage set status = 'failed' where user_id = $1`, [A]));
await rejects('learner cannot call claim_generation', () => as(A, `select claim_generation($1, null, 1)`, [A]));
await rejects('learner cannot call finish_generation', () => as(A, `select finish_generation($1, false)`, [c4.usage_id]));
let anonUsage = false;
await db.exec(`set role anon;`);
try { await db.query(`select get_my_usage()`); } catch { anonUsage = true; }
await db.exec('reset role');
check('anon cannot read usage', anonUsage);

console.log(failures ? `\n${failures} FAILED` : '\nall checks passed');
process.exit(failures ? 1 : 0);
