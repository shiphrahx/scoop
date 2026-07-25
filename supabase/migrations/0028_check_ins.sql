-- Scoop: weekly check-ins. Splits the old always-on "weekly measurements" form
-- off the Progress page into a proper once-a-week event: measurements, an
-- optional weight, an optional note, and optional private progress photos.
--
-- A check-in is one row per user per week (unique on week_start), so the app can
-- ask "has this week's check-in been done?" and show a prompt or a done state.
-- Photos live in their own table, each pointing at a file in a PRIVATE storage
-- bucket (see 0029) — never a public URL.
--
-- The legacy `measurements` table is LEFT IN PLACE (nothing is dropped) and its
-- history is copied forward below, so no past reading is lost. New readings are
-- written to check_ins from here on.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0027.

create table if not exists public.check_ins (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  week_start date not null,
  date       date not null default current_date,
  weight_kg  numeric,
  chest_cm   numeric,
  waist_cm   numeric,
  arms_cm    numeric,
  thighs_cm  numeric,
  hips_cm    numeric,
  note       text,
  created_at timestamptz not null default now(),
  unique (user_id, week_start)
);

create index if not exists check_ins_user_week
  on public.check_ins (user_id, week_start desc);

-- Progress photos for a check-in. storage_path points at a file in the private
-- `check-in-photos` bucket; the row carries user_id too so RLS (and the storage
-- policies in 0029) can gate on it without a join. Deleting a check-in cascades
-- to its photos; the app also deletes the underlying storage objects.
create table if not exists public.check_in_photos (
  id           uuid primary key default gen_random_uuid(),
  check_in_id  uuid not null references public.check_ins (id) on delete cascade,
  user_id      uuid not null references public.users (id) on delete cascade,
  storage_path text not null,
  angle        text not null default 'other'
                 check (angle in ('front', 'side', 'back', 'other')),
  created_at   timestamptz not null default now()
);

create index if not exists check_in_photos_check_in
  on public.check_in_photos (check_in_id);

alter table public.check_ins       enable row level security;
alter table public.check_in_photos enable row level security;

drop policy if exists "own check_ins" on public.check_ins;
create policy "own check_ins" on public.check_ins
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own check_in_photos" on public.check_in_photos;
create policy "own check_in_photos" on public.check_in_photos
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

-- ---------------------------------------------------------------------------
-- Carry existing weekly measurements forward into check_ins so no history is
-- lost. One check-in per (user, week); if a user logged measurements more than
-- once in a week, keep the latest reading. week_start is the Monday of the row's
-- date (date_trunc('week') is Monday in Postgres).
-- ---------------------------------------------------------------------------
insert into public.check_ins
  (user_id, week_start, date, chest_cm, waist_cm, arms_cm, thighs_cm, hips_cm, created_at)
select distinct on (user_id, date_trunc('week', date))
  user_id,
  (date_trunc('week', date))::date,
  date,
  chest_cm,
  waist_cm,
  arms_cm,
  thighs_cm,
  hips_cm,
  created_at
from public.measurements
order by user_id, date_trunc('week', date), date desc
on conflict (user_id, week_start) do nothing;
