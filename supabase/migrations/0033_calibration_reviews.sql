-- Scoop: keep the calibration review the user was shown.
--
-- The review that ends the calibration hold, what their maintenance measured
-- at, how the fortnight went, the target it produced and the loss it predicted,
-- is a point-in-time record. It cannot be recomputed later: every input moves.
-- The weigh-ins age out of the trend window, the food logs fall outside it, the
-- TDEE correction is folded again by the next review, and the target it proposed
-- is by then the target in force. Re-deriving it a month on would produce a
-- different screen and quietly rewrite what the user was actually told.
--
-- So the findings are stored as they were shown, once, when the user starts
-- their deficit. `findings` is the CalibrationWrap object the screen renders
-- (see src/lib/calibrationwrap.ts), jsonb rather than columns because it is a
-- snapshot to display, not something to query or aggregate over, and pinning its
-- shape in the schema would mean a migration every time the review gains a card.
--
-- One row per completed hold. A user who restarts calibration gets another.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0032.

create table if not exists public.calibration_reviews (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.users (id) on delete cascade,
  -- The hold this review is about: when it opened, and when the user ended it
  -- by starting their deficit.
  started_at timestamptz not null,
  ended_at   timestamptz not null default now(),
  -- Whole days the hold ran. Denormalised out of `findings` so the history list
  -- can show "15 days" without parsing every snapshot.
  days       integer not null default 0,
  findings   jsonb not null,
  created_at timestamptz not null default now()
);

create index if not exists calibration_reviews_user_ended
  on public.calibration_reviews (user_id, ended_at desc);

alter table public.calibration_reviews enable row level security;

-- One policy, all four commands, and the auth.uid() call wrapped in a subselect
-- so the planner runs it once per statement rather than once per row (see 0031).
drop policy if exists "own calibration_reviews" on public.calibration_reviews;
create policy "own calibration_reviews" on public.calibration_reviews
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);
