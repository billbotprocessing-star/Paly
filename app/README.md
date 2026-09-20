# Paly — app

Expo (React Native) client for the Paly MVP (see `../docs/paly-mvp-spec.pdf`):
capture → generate a study set → (recall, tutor, planning — upcoming milestones).

Currently implements **Milestone 0 (Foundation)** and **Milestone 1
(Capture, text-only)**: auth, goal setup (Exam/Explore), pasting text as a
source, and AI-generated draft concepts/study items you review and publish.

## Structure

- `app/sign-in.tsx` — email/password auth (Supabase)
- `app/(tabs)/index.tsx` — Home: your goals, + New goal
- `app/(tabs)/study.tsx` — Study: published items across goals
- `app/(tabs)/buddy.tsx` — Buddy: about Paly (tutor lands in Milestone 3)
- `app/new-goal.tsx` — goal setup: Exam or Explore, title, subject, cadence
- `app/goal/[id].tsx` — capture (paste text) → generate → review/edit/publish
- `lib/theme.ts` — design tokens ported from `../index.html`
- `lib/types.ts` — mirrors the Supabase schema (see `../supabase/`)
- `lib/supabase.ts` — Supabase client (AsyncStorage-backed session)
- `lib/auth-context.tsx` — session state, sign in/up/out
- `lib/goals-api.ts` — goal/source/concept/study-item queries + text chunking
  + calls the `generate-set` edge function

## Run it

```bash
npm install
npm run web    # or: npm run ios / npm run android
```

Needs `.env` (already committed — Supabase anon/publishable keys are safe
to expose; RLS is the actual security boundary):

```
EXPO_PUBLIC_SUPABASE_URL=...
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

## Next

- Milestone 2: active recall UI, memory-state scheduler, adaptive daily queue.
- Milestone 3: swap the placeholder generator in `generate-set` for a real
  n8n webhook; add the grounded Socratic tutor.
- Photo/PDF capture (currently text-only per the spec's "first build decision").
