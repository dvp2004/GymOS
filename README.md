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


## Google sign-in

The login screen includes a Google OAuth button. It will only work after Google is enabled in Supabase:

1. Supabase → Authentication → Providers → Google.
2. Copy the Supabase callback URL.
3. Google Cloud Console → create OAuth Client ID → Web application.
4. Add `http://localhost:5173` as an authorised JavaScript origin for local testing.
5. Add the Supabase callback URL as an authorised redirect URI.
6. Paste the Google Client ID and Client Secret back into Supabase and enable the provider.
7. Supabase → Authentication → URL Configuration → add `http://localhost:5173/**` as an allowed redirect URL.

Do not request Gmail scopes. GymOS only needs identity sign-in, not email inbox access.
