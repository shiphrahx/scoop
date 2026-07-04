-- Scoop Phase 3 schema: favourites, pantry items, batch cooking.
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) after 0001.
-- Every table is row-level-secured so a user only ever sees their own rows.

-- ---------------------------------------------------------------------------
-- favourites ("my usual" — one-tap items with fixed macros)
-- ---------------------------------------------------------------------------
create table if not exists public.favourites (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  name       text not null,
  grams      numeric,
  kcal       numeric not null default 0,
  protein_g  numeric not null default 0,
  carbs_g    numeric not null default 0,
  fat_g      numeric not null default 0,
  created_at timestamptz not null default now()
);

create index if not exists favourites_user
  on public.favourites (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- pantry_items (things the user has; macros stored per 100 g, as Open Food
-- Facts reports them). off_barcode is null for hand-entered items.
-- ---------------------------------------------------------------------------
create table if not exists public.pantry_items (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references public.users (id) on delete cascade,
  name          text not null,
  off_barcode   text,
  quantity      int not null default 1,
  kcal_100g     numeric not null default 0,
  protein_100g  numeric not null default 0,
  carbs_100g    numeric not null default 0,
  fat_100g      numeric not null default 0,
  created_at    timestamptz not null default now()
);

create index if not exists pantry_items_user
  on public.pantry_items (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- batches (cook once, eat across days). Store the packs that went in plus the
-- total cooked weight and total macros; macros-per-gram is derived. remaining_g
-- is decremented each time the user eats from the batch.
-- ---------------------------------------------------------------------------
create table if not exists public.batches (
  id             uuid primary key default gen_random_uuid(),
  user_id        uuid not null references public.users (id) on delete cascade,
  name           text not null,
  source_packs   jsonb not null default '[]',
  total_cooked_g numeric not null,
  remaining_g    numeric not null,
  kcal           numeric not null default 0,
  protein_g      numeric not null default 0,
  carbs_g        numeric not null default 0,
  fat_g          numeric not null default 0,
  created_at     timestamptz not null default now()
);

create index if not exists batches_user
  on public.batches (user_id, created_at desc);

-- ---------------------------------------------------------------------------
-- Row level security: each user only touches their own rows.
-- ---------------------------------------------------------------------------
alter table public.favourites   enable row level security;
alter table public.pantry_items enable row level security;
alter table public.batches      enable row level security;

create policy "own favourites" on public.favourites
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own pantry_items" on public.pantry_items
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own batches" on public.batches
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
