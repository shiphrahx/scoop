-- Scoop Phase 4 schema: imported recipes.
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) after 0002.
-- Row-level-secured so a user only ever sees their own rows.

-- ---------------------------------------------------------------------------
-- recipes (imported from a URL or a screenshot, read by AI). base_macros are
-- the macros for the WHOLE recipe as written; ingredients is the parsed list.
-- ---------------------------------------------------------------------------
create table if not exists public.recipes (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  name         text not null,
  source_url   text,
  servings     int not null default 1,
  ingredients  jsonb not null default '[]',
  kcal         numeric not null default 0,
  protein_g    numeric not null default 0,
  carbs_g      numeric not null default 0,
  fat_g        numeric not null default 0,
  created_at   timestamptz not null default now()
);

create index if not exists recipes_user
  on public.recipes (user_id, created_at desc);

alter table public.recipes enable row level security;

create policy "own recipes" on public.recipes
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
