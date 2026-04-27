# GymOS

Personal gym, nutrition, body-weight tracking and AI feedback PWA.

## Current build status

Version 4 adds sparse-data-safe trends, raw historical log import, file import, editable history, waist tracking, and Supabase sync.

- Modern mobile-first React/Vite interface
- Daily weight, optional waist size, sleep, workout and food logging
- Exercise set tracker
- Treadmill/cardio logging
- Recent trend cards
- Coach prompt builder
- JSON export plus JSON/raw text import/backfill
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
   - `daily_logs`: one row per date, including weight, optional waist size, sleep, energy, treadmill and notes.
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
    "postGymEnergy": "3",
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


## Historical data import

The Trends screen accepts either:

1. a GymOS JSON export/import array, or
2. raw dated gym text in this style:

```text
27.4.26
Weight: - kgs
Treadmill:
B. -km, -:00, incline=6.0
Machine Front lat-pulldown: 85lbs, 3, 12
```

Only the date is required. Dashes such as `- kgs`, `-km`, or `-:00` are treated as unavailable values, not zero. This matters because missing data should not corrupt averages.

If you import logs while signed in, they are saved to Supabase under the current user. If you import while local-only, they are saved to browser storage until you push/sync them.

Existing dates are updated rather than duplicated.
