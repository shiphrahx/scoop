-- Scoop Phase 5 schema: auto activity data + the weekly Coach review.
-- Run this in the Supabase SQL Editor (or via the Supabase CLI) after 0003.
-- Row-level-secured so a user only ever sees their own rows.

-- ---------------------------------------------------------------------------
-- activity (one row per user per day). Filled from Fitbit (pulled) or Apple
-- Health Auto Export (pushed to /api/ingest/apple). source records which.
-- ---------------------------------------------------------------------------
create table if not exists public.activity (
  id           uuid primary key default gen_random_uuid(),
  user_id      uuid not null references public.users (id) on delete cascade,
  date         date not null default current_date,
  steps        int,
  workout_kcal numeric,
  sleep_hours  numeric,
  source       text not null default 'manual'
                 check (source in ('fitbit', 'apple', 'manual')),
  created_at   timestamptz not null default now(),
  updated_at   timestamptz not null default now(),
  unique (user_id, date)
);

create index if not exists activity_user
  on public.activity (user_id, date desc);

-- ---------------------------------------------------------------------------
-- fitbit_tokens (OAuth 2.0 tokens for the Fitbit Web API, 1:1 with a user).
-- Kept in its own table so the Fitbit fetch layer stays swappable (the Fitbit
-- legacy Web API is being turned down ~Sept 2026 → Google Health API).
-- ---------------------------------------------------------------------------
create table if not exists public.fitbit_tokens (
  user_id       uuid primary key references public.users (id) on delete cascade,
  access_token  text not null,
  refresh_token text not null,
  expires_at    timestamptz not null,
  scope         text,
  fitbit_user_id text,
  created_at    timestamptz not null default now(),
  updated_at    timestamptz not null default now()
);

-- ---------------------------------------------------------------------------
-- Apple Health Auto Export posts data without a Supabase session, so it
-- authenticates with a per-user secret token instead of a cookie.
-- ---------------------------------------------------------------------------
alter table public.users
  add column if not exists apple_ingest_token text;

create unique index if not exists users_apple_ingest_token
  on public.users (apple_ingest_token)
  where apple_ingest_token is not null;

-- ---------------------------------------------------------------------------
-- Row level security: each user only touches their own rows. The Apple ingest
-- endpoint writes with the service-role key, which bypasses RLS by design.
-- ---------------------------------------------------------------------------
alter table public.activity      enable row level security;
alter table public.fitbit_tokens enable row level security;

create policy "own activity" on public.activity
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

create policy "own fitbit_tokens" on public.fitbit_tokens
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
