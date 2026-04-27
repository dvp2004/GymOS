# GymOS

Personal gym, nutrition, body-weight tracking and AI feedback PWA.

## Current build status

This is the first real app shell:

- Modern mobile-first React/Vite interface
- Daily weight, sleep, workout and food logging
- Exercise set tracker
- Treadmill/cardio logging
- Recent trend cards
- Coach prompt builder
- JSON export
- Local browser persistence
- PWA manifest and service worker

## Important limitation

The current version saves data in the browser using local storage. That is good enough for the first UI prototype, but not enough for long-term use across iPhone and PC.

Next build phase: Supabase authentication and database sync.

## Run locally

```bash
npm install
npm run dev
```

## Build

```bash
npm run build
```

## Roadmap

1. Supabase Auth
2. Supabase Postgres sync
3. Serverless AI feedback endpoint
4. Better trend charts
5. CSV export
6. iOS icon polish
