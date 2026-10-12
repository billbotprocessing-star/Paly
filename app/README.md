# Paly — app

Expo (React Native) client for the Paly MVP (see `../docs/paly-mvp-spec.pdf`):
capture → generate a study set → recall on a spaced schedule → (tutor,
planning — upcoming milestones).

Implements **Milestone 0 (Foundation)**, **Milestone 1 (Capture,
text-only)** and **Milestone 2 (Recall)**: auth, goal setup, pasting text as
a source, Claude-generated draft cards you review and publish, study
sessions, the FSRS scheduler and the adaptive daily queue.

## Structure

- `app/sign-in.tsx` — email/password auth (Supabase)
- `app/(tabs)/index.tsx` — Home: "what to study now" card, your goals, + New goal
- `app/(tabs)/study.tsx` — Study: today's queue (due + new), session length
  picker, per-goal breakdown
- `app/session.tsx` — a study session: recall before reveal, rate
  Again/Hard/Good/Easy, missed cards return in the same sitting, recap
- `app/(tabs)/buddy.tsx` — Buddy: about Paly (tutor lands in Milestone 3)
- `app/new-goal.tsx` — goal setup: Exam or Explore, title, subject, cadence
- `app/goal/[id].tsx` — capture (paste text) → generate → review/edit/
  discard/publish (or publish all); AI credits left; retry generation
- `lib/theme.ts` — design tokens ported from `../index.html`
- `lib/types.ts` — mirrors the Supabase schema (see `../supabase/`)
- `lib/supabase.ts` — Supabase client (AsyncStorage-backed session)
- `lib/auth-context.tsx` — session state, sign in/up/out
- `lib/goals-api.ts` — goal/source/concept/study-item queries + text chunking
  + calls the `generate-set` edge function + AI usage (`get_my_usage`)
- `lib/scheduler.ts` — FSRS-4.5 memory model and the daily queue builder
  (pure functions, tested in `scheduler.test.ts`)
- `lib/study-api.ts` — sessions, queue loading, `record_review` RPC

## Run it

```bash
npm install
npm run web    # or: npm run ios / npm run android
```

Copy `.env.example` to `.env` and fill in your project values (the
Supabase anon/publishable key is safe to ship in the app; RLS is the actual
security boundary):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Deploying the web build

The Expo web export works as a static SPA. It needs to be served from a
**root domain**, not a subpath (GitHub Pages project sites like
`user.github.io/repo/` don't work — the exporter hardcodes root-absolute
asset paths and there's no supported base-path flag in this Expo/CLI
version). Vercel and Netlify both serve at a root domain and are
pre-configured here (`vercel.json`, `netlify.toml`):

1. Push this repo to GitHub (already done).
2. On [vercel.com](https://vercel.com) or [netlify.com](https://netlify.com),
   import the repo, and set **Root Directory** to `app`.
3. Leave build command / output directory as detected (`npm run build:web`
   → `dist`, from the config files). Add `EXPO_PUBLIC_SUPABASE_URL` and
   `EXPO_PUBLIC_SUPABASE_ANON_KEY` as environment variables in the
   dashboard (`.env` is not committed).
4. Deploy. You'll get a `*.vercel.app` or `*.netlify.app` URL serving the
   real, working app — auth, goal setup, capture, generate, publish, study.

Local production build check: `npm run build:web`, then serve `dist/`
with any static server.

## Tests

```bash
npm test        # scheduler + daily queue (Node's built-in runner)
npm run typecheck
```

## Next

- Milestone 3: the grounded Socratic tutor.
- Milestone 4: exam readiness / momentum, notifications, missed-day recovery.
- Photo/PDF capture (currently text-only per the spec's "first build decision").
- Payments: connect App Store / Play subscriptions to `user_plans`.
