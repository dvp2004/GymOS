# GymOS

Personal gym, nutrition, body-weight tracking and AI feedback PWA.

## Current build status

Version 2 adds the foundation that actually matters: data sync.

- Modern mobile-first React/Vite interface
- Daily weight, sleep, workout and food logging
- Exercise set tracker
- Treadmill/cardio logging
- Recent trend cards
- Coach prompt builder
- JSON export
- Local browser fallback
- Supabase Auth
- Supabase Postgres sync
- Row Level Security schema
- PWA manifest and service worker

## Important privacy note

Do not make this repository public once you start using real Supabase credentials or personal logs. The `.env` file must never be committed.

## Run locally

```bash
npm install
npm run dev
```

## Supabase setup

1. Create a Supabase project.
2. Open SQL Editor.
3. Paste and run `supabase/schema.sql`.
4. Go to Project Settings → API.
5. Copy:
   - Project URL
   - anon public key
6. Create `.env` in the project root:

```bash
VITE_SUPABASE_URL=https://your-project-ref.supabase.co
VITE_SUPABASE_ANON_KEY=your-public-anon-key
```

7. Restart Vite:

```bash
npm run dev
```

## How sync works

- If `.env` is missing, GymOS runs in local-only mode.
- If Supabase is configured, GymOS shows a login screen.
- After login, logs are loaded from Supabase.
- Saving a log writes to Supabase and local browser storage.
- The app keeps JSON export as a manual backup.

## Next roadmap

1. Vercel deployment
2. iPhone Home Screen install
3. Serverless OpenAI coach endpoint
4. Better charts
5. CSV export
6. Rest timer and workout-day automation
