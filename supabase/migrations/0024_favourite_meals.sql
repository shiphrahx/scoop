-- Scoop: favourite meals. A whole meal the user liked — its foods and their
-- amounts — saved under a name so they can drop the same meal back into any slot
-- with one tap, instead of rebuilding it food by food.
--
-- This is NOT the existing `favourites` table: that holds single "my usual"
-- foods logged with one tap. A favourite MEAL is a list of foods (the same
-- shape a hand-built planned meal stores in `items`), plus the meal's totals so
-- the favourites page can show its macros without re-summing.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0023.

create table if not exists public.favourite_meals (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  name       text not null,
  -- The meal's foods, each with its grams and per-100g macros (PlanItem[]), so
  -- adding the favourite back rebuilds an identical meal.
  items      jsonb not null default '[]',
  kcal       numeric not null default 0,
  protein_g  numeric not null default 0,
  carbs_g    numeric not null default 0,
  fat_g      numeric not null default 0,
  fiber_g    numeric not null default 0,
  sugar_g    numeric not null default 0,
  satfat_g   numeric not null default 0,
  sodium_mg  numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists favourite_meals_user_created
  on public.favourite_meals (user_id, created_at desc);

alter table public.favourite_meals enable row level security;

drop policy if exists "own favourite meals" on public.favourite_meals;
create policy "own favourite meals" on public.favourite_meals
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
