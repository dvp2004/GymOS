# GymOS

Personal gym, nutrition, body-weight tracking and AI feedback PWA.

## Current build status

Version 3 adds editable history, waist tracking, old-log import, and Supabase sync.

- Modern mobile-first React/Vite interface
- Daily weight, optional waist size, sleep, workout and food logging
- Exercise set tracker
- Treadmill/cardio logging
- Recent trend cards
- Coach prompt builder
- JSON export and JSON import/backfill
- Local browser fallback
- Supabase Auth
- Supabase Postgres sync under the signed-in user
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

## Where data is stored

GymOS currently stores data in two places:

1. Supabase Postgres when you are signed in.
   - `daily_logs`: one row per date, including weight, optional waist size, sleep, treadmill and notes.
   - `exercise_entries`: exercises linked to a daily log.
   - `meal_entries`: meals linked to a daily log.
   - `ai_feedback`: reserved for future AI responses.
2. Browser `localStorage` as a fallback/cache and for local-only mode.

Row Level Security policies in `supabase/schema.sql` restrict rows to the authenticated user.

## How sync works

- If `.env` is missing, GymOS runs in local-only mode.
- If Supabase is configured, GymOS shows a login screen.
- After login, logs are loaded from Supabase.
- Saving a log writes to Supabase and local browser storage.
- To edit a saved log, open Trends → Recent logs → Edit, change the fields, then Save log again.
- Saving the same date updates that date instead of creating a duplicate.
- The app keeps JSON export as a manual backup.

## Importing old logs

Open Trends → Import old logs and paste a JSON array. `date` is the only required field because the app needs a day to attach the log to. Every fitness field can be blank.

Example:

```json
[
  {
    "date": "2026-04-08",
    "weightKg": "92",
    "waistSizeCm": "",
    "workoutType": "Upper",
    "gymTime": "10:15-11:45",
    "preWorkout": "2 bananas + latte",
    "treadmillDistanceKm": "1.00",
    "treadmillMinutes": "11:58",
    "treadmillIncline": "6.0",
    "notes": "Felt tired after gym",
    "exercises": [],
    "meals": []
  }
]
```

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

## Patch v9 notes

- The visible post-gym energy input and trend cards have been removed. The database column can stay for backward compatibility, but GymOS no longer asks you to track it.
- Workout chips now act as safe view selectors. Clicking Lower on an Upper day will not overwrite the saved Upper exercises. You must explicitly apply a template to replace the day.
- Trends now includes an exercise progression board, split balance, cardio bests, and volume leaders based on repeated exercises.
- Imported data stays in Supabase after one successful import. You do not need to import the JSON again after refresh or re-opening the app.

## v10 Product Redesign Notes

This build moves GymOS away from a form-first prototype and towards a mobile-first gym companion.

### Added in v10

- Premium dark UI with design tokens, glass panels, stronger typography, and mobile-first spacing.
- Bottom tab navigation on mobile for iPhone use.
- Redesigned Today screen with:
  - suggested next workout,
  - weekly consistency dots,
  - body-status card,
  - weight sparkline,
  - cardio and data-quality cards,
  - last-session summary.
- Workout logging improvements:
  - workout-type chips remain view selectors,
  - replacing a saved day with a template now requires explicit confirmation,
  - exercise cards show previous and best logged performance when history exists,
  - one-tap “Copy last” support for recurring exercises.
- Trends improvements:
  - 8-week consistency heatmap,
  - data coverage cards,
  - improved exercise-progression and cardio summary presentation.
- Added `.gitignore` so `.env` is not committed.

### Important

Run this once if `.env` is already tracked in Git:

```bash
git rm --cached .env
```

Keep real environment values in Vercel and your local `.env`; only `.env.example` belongs in the repository.
