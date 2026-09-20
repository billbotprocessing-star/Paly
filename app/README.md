# Paly — app

Expo (React Native) implementation of the Paly product loop: **capture → clarify → ship**.

## Structure

- `app/(tabs)/index.tsx` — Home: mascot, capture zone, open scraps
- `app/(tabs)/study.tsx` — Study: shipped study cards
- `app/(tabs)/buddy.tsx` — Buddy: about Paly
- `app/new-scrap.tsx` — capture form (type / paste / photo) → creates a scrap
- `app/scrap/[id].tsx` — Clarify screen: chat with Paly on a scrap, then Ship
- `lib/theme.ts` — design tokens ported from `../index.html`
- `lib/types.ts` — `Scrap` model (`status: pale | clarifying | ready`)
- `lib/scraps-context.tsx` — scrap state + `AsyncStorage` persistence
- `lib/mock-clarify.ts` — canned Paly replies and study-card generation, stands in for a real model call

## Run it

```bash
npm install
npm run web    # or: npm run ios / npm run android
```

## Next

- Swap `lib/mock-clarify.ts` for a real AI chat grounded on the scrap.
- Real camera capture + OCR for the photo path (currently picks from the library).
- Accounts/sync.
