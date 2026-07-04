-- Scoop Phase 2 schema: profiles, weights, measurements, food logs, targets.
-- Run this in the Supabase SQL Editor (or via the Supabase CLI).
-- Every table is row-level-secured so a user only ever sees their own rows.

-- ---------------------------------------------------------------------------
-- users (public profile, 1:1 with auth.users)
-- ---------------------------------------------------------------------------
create table if not exists public.users (
  id            uuid primary key references auth.users (id) on delete cascade,
  email         text,
  diet_type     text not null default 'regular'
                  check (diet_type in ('regular', 'vegetarian', 'vegan')),
  allergies     text[] not null default '{}',
  dislikes      text[] not null default '{}',
  goal          text not null default 'lose',
  goal_pace     text not null default 'steady'
                  check (goal_pace in ('gentle', 'steady', 'aggressive')),
  activity_level text not null default 'moderate'
                  check (activity_level in
                    ('sedentary', 'light', 'moderate', 'active', 'very_active')),
  height_cm     numeric,
  sex           text check (sex in ('male', 'female')),
  birth_year    int,
  anthropic_api_key text,
  onboarded_at  timestamptz,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- weights (one row per user per day)
-- ---------------------------------------------------------------------------
create table if not exists public.weights (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  date       date not null default current_date,
  weight_kg  numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- measurements (weekly)
-- ---------------------------------------------------------------------------
create table if not exists public.measurements (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  date       date not null default current_date,
  waist_cm   numeric,
  arms_cm    numeric,
  thighs_cm  numeric,
  hips_cm    numeric,
  created_at timestamptz not null default now(),
  unique (user_id, date)
);

-- ---------------------------------------------------------------------------
-- food_logs
-- ---------------------------------------------------------------------------
create table if not exists public.food_logs (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  logged_at  timestamptz not null default now(),
  name       text not null,
  source     text not null default 'manual'
               check (source in ('batch', 'barcode', 'recipe', 'manual')),
  grams      numeric,
  kcal       numeric not null default 0,
  protein_g  numeric not null default 0,
  carbs_g    numeric not null default 0,
  fat_g      numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists food_logs_user_time
  on public.food_logs (user_id, logged_at);

-- ---------------------------------------------------------------------------
-- daily_targets (one macro target per user per week)
-- ---------------------------------------------------------------------------
create table if not exists public.daily_targets (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  week_start date not null,
  kcal       numeric not null,
  protein_g  numeric not null,
  carbs_g    numeric not null,
  fat_g      numeric not null,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

-- ---------------------------------------------------------------------------
-- Row level security: each user only touches their own rows.
-- ---------------------------------------------------------------------------
alter table public.users        enable row level security;
alter table public.weights      enable row level security;
alter table public.measurements enable row level security;
alter table public.food_logs    enable row level security;
alter table public.daily_targets enable row level security;

create policy "own profile" on public.users
  for all using (auth.uid() = id) with check (auth.uid() = id);

create policy "own weights" on public.weights
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own measurements" on public.measurements
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own food_logs" on public.food_logs
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own daily_targets" on public.daily_targets
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
