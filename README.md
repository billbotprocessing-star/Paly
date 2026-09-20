# Paly

**Paly** is a calm mobile study buddy. You drop something confusing — a worksheet photo, a pasted paragraph, or a half-formed question — and Paly helps you clarify it, then ships something useful: a plain-language explanation, a tiny practice set, or a short study card.

> Formal / longer name: **Palebytes**. Consumer-facing name: **Paly**.

## Product idea

Core loop:

1. **Capture** — photo, paste, or type a scrap of confusion  
2. **Clarify** — talk it through with Paly, no judgment or streak pressure  
3. **Ship** — get a finished study artifact you can actually use  

Tone: soft, quiet, present. No shame scoreboards. The mascot is a misty cloud-friend made of “pale bytes.”

## What’s in this repo

| File | Purpose |
|------|---------|
| `index.html` | Static first-screen mock (Home): wordmark, mascot, capture zone, open scraps, tab bar |
| `mascot.png` | Paly character asset used on the home screen |
| `README.md` | Project overview and setup |
| `app/` | Expo (React Native) app: Home / Study / Buddy tabs, capture form, Clarify screen |

This is an early **UI prototype**, not a full app yet. Capture / Study / Buddy tabs in `index.html` are visual only; the real, interactive version lives in `app/`.

## Run it locally

### Option A — open the file

1. Clone or download this folder.
2. Open `index.html` in a modern browser (Chrome, Safari, Firefox, Edge).

Keep `mascot.png` next to `index.html` so the character loads.

### Option B — tiny static server (recommended)

From this directory:

```bash
# Python 3
python3 -m http.server 5173

# or Node (if you prefer)
npx --yes serve -l 5173
```

Then visit [http://localhost:5173](http://localhost:5173).

On a phone, use your machine’s local IP on the same Wi‑Fi, or use browser device mode.

### Option C — the real app (Expo)

```bash
cd app
npm install
npm run web    # or: npm run ios / npm run android
```

See `app/README.md` for details.

## How we’ll set this up as a real app

Suggested path once the prototype feels right:

1. **Mobile shell** — move the UI into **Expo (React Native)** so one codebase targets iOS and Android. Keep the same visual language (off-white, lavender/mint/peach scraps, soft mascot). ✅ started in `app/`
2. **Navigation** — Home / Study / Buddy tabs become real screens; Open scraps become a local list (then sync later). ✅
3. **Capture** — camera + paste + text input writing into a `scrap` model (`status: pale | clarifying | ready`). ✅
4. **Clarify & ship** — AI chat grounded on the scrap; outputs saved as study cards / quizzes the student can reopen. ✅ (mocked responses for now)
5. **Accounts & sync** (later) — optional sign-in, cross-device scraps, privacy-first defaults for student data.
6. **Brand** — ship as **Paly**; keep Palebytes in legal / About if needed.

No backend or API keys are required for this static mock.

## Design notes

- Mobile-first canvas (~390px), full-bleed on small phones.
- Status pills mirror the product loop: `clarify` → `ready to ship`.
- Accessibility: semantic headings, labeled capture control, tab `aria-current` on Home.

## Next steps

- [x] Wire the capture button to a simple “new scrap” form (still static/local).
- [x] Add a Clarify screen that opens when a scrap is tapped.
- [x] Port tokens (colors, radii, type) into an Expo theme when ready to build native.

---

Made with a soft cloud and a lot of unfinished homework in mind.
