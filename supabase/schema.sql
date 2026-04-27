-- GymOS Supabase schema draft. This is not wired into the frontend yet.
-- Run this in Supabase SQL editor when we start the database-sync phase.

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2),
  sleep_hours numeric(4,2),
  workout_type text not null default 'Custom',
  gym_time text,
  pre_workout text,
  post_gym_energy integer check (post_gym_energy between 1 and 10),
  treadmill_distance_km numeric(6,2),
  treadmill_minutes numeric(6,2),
  treadmill_incline numeric(4,1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

create table if not exists public.exercise_entries (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  exercise_name text not null,
  weight text,
  unit text not null default 'lbs',
  sets text,
  reps text,
  completed_sets integer not null default 0,
  position integer not null default 0
);

create table if not exists public.meal_entries (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid not null references public.daily_logs(id) on delete cascade,
  label text not null,
  description text,
  protein_score integer not null default 1 check (protein_score between 0 and 3),
  position integer not null default 0
);

create table if not exists public.ai_feedback (
  id uuid primary key default gen_random_uuid(),
  daily_log_id uuid references public.daily_logs(id) on delete set null,
  user_id uuid not null references auth.users(id) on delete cascade,
  question text not null,
  prompt_context jsonb,
  response text not null,
  created_at timestamptz not null default now()
);

alter table public.daily_logs enable row level security;
alter table public.exercise_entries enable row level security;
alter table public.meal_entries enable row level security;
alter table public.ai_feedback enable row level security;

create policy "Users can manage own daily logs"
  on public.daily_logs
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

create policy "Users can manage exercises through own logs"
  on public.exercise_entries
  for all
  using (
    exists (
      select 1 from public.daily_logs
      where daily_logs.id = exercise_entries.daily_log_id
      and daily_logs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.daily_logs
      where daily_logs.id = exercise_entries.daily_log_id
      and daily_logs.user_id = auth.uid()
    )
  );

create policy "Users can manage meals through own logs"
  on public.meal_entries
  for all
  using (
    exists (
      select 1 from public.daily_logs
      where daily_logs.id = meal_entries.daily_log_id
      and daily_logs.user_id = auth.uid()
    )
  )
  with check (
    exists (
      select 1 from public.daily_logs
      where daily_logs.id = meal_entries.daily_log_id
      and daily_logs.user_id = auth.uid()
    )
  );

create policy "Users can manage own AI feedback"
  on public.ai_feedback
  for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
