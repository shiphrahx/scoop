-- Scoop: the two things the Progress insights dashboard needs to STORE.
--
-- Everything else on that dashboard is derived at read time from data the app
-- already holds (weights, check_ins, food_logs, daily_targets, activity,
-- high_days). Only two modules need the user to tell us something new:
--
--   non_scale_victories  wins the scale can't see, "ran 5k without stopping",
--                        "rings fit again". The scale stalls for weeks at a
--                        time; these are what carries someone through it, so
--                        they're a logged, dated record rather than a feeling.
--   custom_milestones    a goal the user picked themselves, usually a clothing
--                        size or an event. target_weight_kg is optional: a
--                        milestone with one gets ticked off automatically from
--                        the trend weight, one without is ticked by hand
--                        (reached_at), because "fit into my old jeans" has no
--                        number attached.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0029.

create table if not exists public.non_scale_victories (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  date       date not null default current_date,
  text       text not null,
  created_at timestamptz not null default now()
);

create index if not exists non_scale_victories_user_date
  on public.non_scale_victories (user_id, date desc);

create table if not exists public.custom_milestones (
  id              uuid primary key default gen_random_uuid(),
  user_id         uuid not null references public.users (id) on delete cascade,
  label           text not null,
  -- When set, the app marks it reached once the trend weight passes it. When
  -- null the user ticks it off themselves.
  target_weight_kg numeric,
  reached_at      date,
  created_at      timestamptz not null default now()
);

create index if not exists custom_milestones_user
  on public.custom_milestones (user_id, created_at);

alter table public.non_scale_victories enable row level security;
alter table public.custom_milestones   enable row level security;

drop policy if exists "own non_scale_victories" on public.non_scale_victories;
create policy "own non_scale_victories" on public.non_scale_victories
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);

drop policy if exists "own custom_milestones" on public.custom_milestones;
create policy "own custom_milestones" on public.custom_milestones
  for all using (auth.uid() = user_id) with check (auth.uid() = user_id);
