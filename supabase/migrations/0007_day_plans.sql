-- Scoop: "Plan my day". A user picks how their day breaks into meals (named
-- slots they can edit), pins the meals they already know they'll eat, and the
-- app fills the rest from their pantry to hit the day's macros.
-- Run in the Supabase SQL Editor (or via the CLI) after 0006.

-- ---------------------------------------------------------------------------
-- Meal slots are a per-user, ordered, editable list of meal names. Everyone
-- starts with a sensible four; they add / rename / remove in Settings.
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists meal_slots text[] not null
    default '{Breakfast,Lunch,Snack,Dinner}';

-- ---------------------------------------------------------------------------
-- planned_meals: one row per (user, date, slot). origin 'manual' is a meal the
-- user pinned as free text (macros estimated by AI when they plan the day);
-- 'ai' is a dish the app suggested from the pantry. portions/swaps mirror the
-- meal-suggestion shape. logged_food_id links the food_log row once the user
-- says they ate it, so a slot shows as done and we never double-count macros.
-- ---------------------------------------------------------------------------
create table if not exists public.planned_meals (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  date           date not null default current_date,
  slot           text not null,
  position       int  not null default 0,
  origin         text not null default 'ai' check (origin in ('manual', 'ai')),
  name           text not null default '',
  portions       jsonb not null default '[]',
  swaps          jsonb not null default '[]',
  why            text,
  kcal           numeric not null default 0,
  protein_g      numeric not null default 0,
  carbs_g        numeric not null default 0,
  fat_g          numeric not null default 0,
  logged_food_id uuid references public.food_logs (id) on delete set null,
  created_at     timestamptz not null default now(),
  unique (user_id, date, slot)
);

create index if not exists planned_meals_user_date
  on public.planned_meals (user_id, date);

alter table public.planned_meals enable row level security;

create policy "own planned meals" on public.planned_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
