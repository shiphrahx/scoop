-- Scoop: record which phase each weekly target belongs to.
--
-- The weekly review used to know only one state: deficit. That made it a
-- one-way ratchet — stall, cut 7%, stall, cut 7%, hit the floor, hold there
-- indefinitely. Nothing but a too-fast loss ever moved a target upwards, and
-- reaching the goal weight did nothing at all.
--
--   deficit      eating below maintenance to lose
--   diet_break   a planned fortnight at maintenance after a long deficit, which
--                recovers some of the adaptation a long diet causes
--   maintenance  the goal weight is reached; hold it
--
-- Storing the phase per week is what lets the review count consecutive weeks in
-- a deficit and decide a break is due.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0022.

alter table public.daily_targets
  add column if not exists phase text not null default 'deficit';

alter table public.daily_targets
  drop constraint if exists daily_targets_phase_check;
alter table public.daily_targets
  add constraint daily_targets_phase_check
  check (phase in ('deficit', 'diet_break', 'maintenance'));
