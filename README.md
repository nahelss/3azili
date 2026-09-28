# 3azili (عزّلي) — Starter Codebase

Starter scaffold for the Lebanon cleaning-marketplace app, matching the data
model and MVP feature list from the planning spec. This is a **skeleton for
a developer to build on** — not production-ready. Treat it as the first
commit, not the finish line.

## What's here

- `backend/` — Node + Express + Prisma (Postgres). Has the full schema from
  the spec, plus working routes for auth (OTP stub), cleaner search,
  booking creation with the labor/supplies commission math, payments, and
  admin (rate config, supply catalog, overrides, audit log).
- `mobile/` — Expo (React Native) app. One codebase builds to iOS, Android,
  **and** web (`expo start --web`), so it also serves as your web app
  rather than needing a separate frontend.
- `mobile/src/theme.js` — the brand palette pulled from the app icon
  (sky blue, deep navy, two leaf greens). Use these constants in new
  screens instead of hardcoding hex values.
- `mobile/assets/icon.png` + `mobile/app.json` — the app icon wired up for
  Expo. **Note:** this is the combined icon+wordmark version (text baked
  in). Android's adaptive icon system crops the foreground image into a
  circle/squircle/rounded-square depending on the launcher, which will
  likely clip the wordmark text — before shipping, swap in an icon-only
  version (mark alone, no text) for `adaptiveIcon.foregroundImage`, and
  keep the combined version for marketing/store listing images instead.

## Getting it running

### Backend
```
cd backend
cp .env.example .env   # fill in a real DATABASE_URL and JWT_SECRET
npm install
npx prisma migrate dev --name init
node prisma/seed.js
npm run dev
```

### Mobile / web
```
cd mobile
npm install
npm start               # then press i / a / w for iOS / Android / web
```
Set `EXPO_PUBLIC_API_URL` to point at your running backend (e.g. your LAN
IP during local dev, or your deployed URL later).

## What's deliberately left undone

These need real decisions/integrations before this becomes the real app —
see the planning spec (`cleaning-app-spec.md`) for the reasoning behind each:

- **Real OTP delivery** — `auth.js` just logs a code. Wire up an SMS/WhatsApp
  provider (WhatsApp Business API is worth prioritizing given Lebanon's
  telecom reliability issues).
- **Real payment integrations** — Whish/OMT/Bob Finance API credentials and
  webhook handling aren't here; `payments.js` has a `mark-cleared` endpoint
  ready to be called from a webhook once you have one.
- **ID verification / file uploads** — `LegalDocument` model exists but
  there's no upload endpoint or storage (S3-compatible bucket, etc.) yet.
- **Auth/role middleware** — none of the admin routes check who's calling
  them. Don't deploy `admin.js` publicly as-is.
- **Cleaner-side screens** — `CleanerHomeScreen.js` is a placeholder; the
  web prototype shows the intended UX to build toward.
- **Migrant worker eligibility** — flagged as a legal question, not a code
  gap. Don't build onboarding logic around an assumption here until you've
  had that conversation with a lawyer.
