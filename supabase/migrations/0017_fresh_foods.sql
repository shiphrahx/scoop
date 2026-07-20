-- Scoop: a shared reference of fresh, unpackaged whole foods (banana, apple,
-- avocado…) so the user can add one to their pantry by NAME and get sensible
-- per-100g macros and real-world portion sizes without typing numbers.
--
-- Two tables:
--   fresh_foods        one row per food, per-100g macros (as everywhere).
--   fresh_food_sizes   the named sizes a food comes in (small/medium/large…),
--                      each with a typical weight in grams. Macros for a size
--                      are derived: per-100g × grams ÷ 100.
--
-- This is REFERENCE data, shared across users (not per-user like the pantry):
-- everyone reads the same table, and any signed-in user can contribute a food
-- or a size (created_by = them). Seed rows have created_by = null. Run after
-- 0016.

create table if not exists public.fresh_foods (
  id             uuid primary key default gen_random_uuid(),
  name           text not null,
  kcal_100g      numeric not null default 0,
  protein_100g   numeric not null default 0,
  carbs_100g     numeric not null default 0,
  fat_100g       numeric not null default 0,
  fiber_100g     numeric not null default 0,
  sugar_100g     numeric not null default 0,
  satfat_100g    numeric not null default 0,
  sodium_mg_100g numeric not null default 0,
  created_by     uuid references public.users (id) on delete set null,
  created_at     timestamptz not null default now()
);

-- One row per food name, case-insensitively — so "Banana" and "banana" can't
-- both exist and split a food's sizes across two rows.
create unique index if not exists fresh_foods_name_lower
  on public.fresh_foods (lower(name));

create table if not exists public.fresh_food_sizes (
  id         uuid primary key default gen_random_uuid(),
  food_id    uuid not null references public.fresh_foods (id) on delete cascade,
  label      text not null,
  grams      numeric not null check (grams > 0),
  created_by uuid references public.users (id) on delete set null,
  created_at timestamptz not null default now()
);

-- A food has each size label once (case-insensitively): one "medium" banana.
create unique index if not exists fresh_food_sizes_food_label
  on public.fresh_food_sizes (food_id, lower(label));

create index if not exists fresh_food_sizes_food
  on public.fresh_food_sizes (food_id);

-- ---------------------------------------------------------------------------
-- Row level security. Reference data is shared: everyone reads it. Writes are
-- open to any signed-in user, who owns only the rows they add (created_by).
-- Seed rows (created_by null) are read-only to everyone — no user can edit or
-- delete them.
-- ---------------------------------------------------------------------------
alter table public.fresh_foods      enable row level security;
alter table public.fresh_food_sizes enable row level security;

create policy "read fresh_foods" on public.fresh_foods
  for select using (true);
create policy "add fresh_foods" on public.fresh_foods
  for insert with check (auth.uid() = created_by);
create policy "edit own fresh_foods" on public.fresh_foods
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "delete own fresh_foods" on public.fresh_foods
  for delete using (auth.uid() = created_by);

create policy "read fresh_food_sizes" on public.fresh_food_sizes
  for select using (true);
create policy "add fresh_food_sizes" on public.fresh_food_sizes
  for insert with check (auth.uid() = created_by);
create policy "edit own fresh_food_sizes" on public.fresh_food_sizes
  for update using (auth.uid() = created_by) with check (auth.uid() = created_by);
create policy "delete own fresh_food_sizes" on public.fresh_food_sizes
  for delete using (auth.uid() = created_by);
