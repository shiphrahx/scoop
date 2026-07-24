-- Scoop: optional calorie/carb cycling ("high days").
--
-- Research is clear that the WEEKLY calorie total drives fat loss; how it's
-- spread across the days mostly helps adherence and fuels workouts. So this
-- feature NEVER changes the weekly total — it only redistributes it into a few
-- higher-intake days (mostly extra carbs) and the rest a little lower. Off by
-- default: with it off the app behaves exactly as before (a flat daily target).
--
-- On the user (settings):
--   cycling_enabled           master switch, off by default.
--   high_days_per_week        how many high days a week the user wants. NULL
--                             means "use the recommended count for my goal" —
--                             the app derives it (see src/lib/highday.ts) so a
--                             goal change re-recommends without silently
--                             overwriting a number the user set by hand.
--   high_day_surplus_g_carbs  grams of extra CARBS a high day adds. The low days
--                             each give back a share so the 7-day total is
--                             unchanged. Carbs are the lever; protein and fat
--                             hold steady across the week.
--
-- One row per taken high day, so the app can show "X high days left this week"
-- and block going over the weekly allowance. week_start is the Monday of the
-- day's week (in the user's zone), stored so the allowance resets cleanly on
-- rollover without date maths at read time.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0024.

alter table public.users
  add column if not exists cycling_enabled          boolean not null default false,
  add column if not exists high_days_per_week        int,
  add column if not exists high_day_surplus_g_carbs  int not null default 75;

create table if not exists public.high_days (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  date       date not null,
  week_start date not null,
  created_at timestamptz not null default now(),
  -- A day is either high or it isn't — never two rows for the same date.
  unique (user_id, date)
);

create index if not exists high_days_user_week
  on public.high_days (user_id, week_start);

alter table public.high_days enable row level security;

drop policy if exists "own high days" on public.high_days;
create policy "own high days" on public.high_days
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
