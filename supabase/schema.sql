-- GymOS Supabase schema v3.
-- Run the whole file in Supabase SQL Editor.
-- It creates private per-user tables with Row Level Security.

create extension if not exists pgcrypto;

create table if not exists public.daily_logs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  log_date date not null,
  weight_kg numeric(5,2),
  waist_size_cm numeric(5,2),
  sleep_hours numeric(4,2),
  workout_type text not null default 'Custom',
  gym_time text,
  pre_workout text,
  post_gym_energy integer check (post_gym_energy is null or (post_gym_energy between 0 and 10)),
  treadmill_distance_km numeric(6,2),
  treadmill_minutes numeric(6,2),
  treadmill_incline numeric(4,1),
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, log_date)
);

alter table public.daily_logs
add column if not exists waist_size_cm numeric(5,2);

-- Existing projects may already have the older 1-10 check constraint.
-- Replace it so missing optional values stay NULL and a genuine 0/10 score is allowed.
alter table public.daily_logs
  drop constraint if exists daily_logs_post_gym_energy_check;

alter table public.daily_logs
  add constraint daily_logs_post_gym_energy_check
  check (post_gym_energy is null or (post_gym_energy between 0 and 10));


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

drop policy if exists "daily_logs_select_own" on public.daily_logs;
drop policy if exists "daily_logs_insert_own" on public.daily_logs;
drop policy if exists "daily_logs_update_own" on public.daily_logs;
drop policy if exists "daily_logs_delete_own" on public.daily_logs;

create policy "daily_logs_select_own"
on public.daily_logs
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "daily_logs_insert_own"
on public.daily_logs
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "daily_logs_update_own"
on public.daily_logs
for update
to authenticated
using ((select auth.uid()) = user_id)
with check ((select auth.uid()) = user_id);

create policy "daily_logs_delete_own"
on public.daily_logs
for delete
to authenticated
using ((select auth.uid()) = user_id);

drop policy if exists "exercise_entries_select_own" on public.exercise_entries;
drop policy if exists "exercise_entries_insert_own" on public.exercise_entries;
drop policy if exists "exercise_entries_update_own" on public.exercise_entries;
drop policy if exists "exercise_entries_delete_own" on public.exercise_entries;

create policy "exercise_entries_select_own"
on public.exercise_entries
for select
to authenticated
using (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = exercise_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

create policy "exercise_entries_insert_own"
on public.exercise_entries
for insert
to authenticated
with check (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = exercise_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

create policy "exercise_entries_update_own"
on public.exercise_entries
for update
to authenticated
using (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = exercise_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = exercise_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

create policy "exercise_entries_delete_own"
on public.exercise_entries
for delete
to authenticated
using (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = exercise_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

drop policy if exists "meal_entries_select_own" on public.meal_entries;
drop policy if exists "meal_entries_insert_own" on public.meal_entries;
drop policy if exists "meal_entries_update_own" on public.meal_entries;
drop policy if exists "meal_entries_delete_own" on public.meal_entries;

create policy "meal_entries_select_own"
on public.meal_entries
for select
to authenticated
using (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = meal_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

create policy "meal_entries_insert_own"
on public.meal_entries
for insert
to authenticated
with check (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = meal_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

create policy "meal_entries_update_own"
on public.meal_entries
for update
to authenticated
using (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = meal_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
)
with check (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = meal_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

create policy "meal_entries_delete_own"
on public.meal_entries
for delete
to authenticated
using (
  exists (
    select 1 from public.daily_logs
    where public.daily_logs.id = meal_entries.daily_log_id
    and public.daily_logs.user_id = (select auth.uid())
  )
);

drop policy if exists "ai_feedback_select_own" on public.ai_feedback;
drop policy if exists "ai_feedback_insert_own" on public.ai_feedback;
drop policy if exists "ai_feedback_delete_own" on public.ai_feedback;

create policy "ai_feedback_select_own"
on public.ai_feedback
for select
to authenticated
using ((select auth.uid()) = user_id);

create policy "ai_feedback_insert_own"
on public.ai_feedback
for insert
to authenticated
with check ((select auth.uid()) = user_id);

create policy "ai_feedback_delete_own"
on public.ai_feedback
for delete
to authenticated
using ((select auth.uid()) = user_id);
