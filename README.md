# Paly

**Paly** turns anything you want to learn into a daily retention loop:
capture a source, get AI-generated concepts and recall prompts, review
them on an adaptive schedule, and resolve confusion with a Socratic tutor
grounded in your own material.

> Formal / longer name: **Palebytes**. Consumer-facing name: **Paly**.
> Full product + data spec: [`docs/paly-mvp-spec.pdf`](docs/paly-mvp-spec.pdf).

## The loop

capture a source → extract concepts → attempt recall → adapt the next
review → resolve confusion with the tutor → repeat.

Two onboarding modes share one engine: **Exam** (deadline-aware, works
backwards from a date) and **Explore** (curiosity-paced, no deadline
pressure).

## What's in this repo

| Path | Purpose |
|------|---------|
| `app/` | Expo (React Native) client — goal setup, capture, generated study sets |
| `supabase/` | Database schema + RLS policies + the `generate-set` edge function |
| `docs/paly-mvp-spec.pdf` | The product + data specification this build follows |
| `index.html`, `mascot.png` | Original static prototype (superseded by `app/`, kept for reference) |

## Status

Building against the spec's delivery plan (Milestone 0 → 5). Currently
shipped:

- **Milestone 0 — Foundation**: Supabase auth, schema, RLS, private
  storage, the `ai_jobs` async-job contract.
- **Milestone 1 — Capture (text-only)**: goal setup (Exam/Explore), paste
  text as a source, AI-generated draft concepts + recall items (placeholder
  heuristic today, swappable for a real n8n `GENERATE_SET` webhook later
  without touching the app or schema), review/edit/publish.

Not yet built: active recall + adaptive scheduling (Milestone 2), the
grounded Socratic tutor (Milestone 3), exam-readiness/momentum planning and
notifications (Milestone 4), photo/PDF capture, voice.

## Run it

```bash
cd app
npm install
npm run web    # or: npm run ios / npm run android
```

See `app/README.md` and `supabase/README.md` for details.

## Live web build

Vercel or Netlify, serving `app/` at a root domain — see "Deploying the
web build" in `app/README.md`. (Not GitHub Pages: that serves this repo
at a `/Paly/` subpath, which the Expo web exporter's root-absolute asset
paths don't support.)

## Original static prototype

`index.html` at the repo root (open directly, or `python3 -m http.server
5173` from this directory) is the first-pass visual mock this build grew
out of — still live at the repo's GitHub Pages link if enabled, but no
longer wired to anything. `app/` is the real, working client.

---

Made with a soft cloud and a lot of unfinished homework in mind.
