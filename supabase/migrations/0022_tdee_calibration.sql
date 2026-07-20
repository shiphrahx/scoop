-- Scoop: remember what each user actually burns, not just what the formula
-- predicts for them.
--
-- Mifflin–St Jeor has a standard error around 10% and tails reaching 25%, so a
-- predicted maintenance can be 400 kcal out for any given person before NEAT,
-- metabolic adaptation or logging bias are counted. Energy balance is
-- measurable though, and we already store both sides of it:
--
--   TDEE ≈ mean daily intake + (weight lost × 7700) / days
--
--   tdee_calibration    ratio between the burn the user really shows and the one
--                       the formula predicted. 1 = no measurement yet. Clamped
--                       to 0.75–1.25 in code so one badly-logged fortnight
--                       cannot rewrite someone's metabolism.
--   tdee_observed_kcal  the most recent measured burn, kept for the Coach page
--                       to show its working.
--   tdee_observed_at    when that measurement was taken.
--
-- Storing this on the user (rather than deriving it each time) is the point: a
-- profile edit used to recompute the target from the formula and throw away
-- every correction the weekly review had learned.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0021.

alter table public.users
  add column if not exists tdee_calibration   numeric not null default 1,
  add column if not exists tdee_observed_kcal numeric,
  add column if not exists tdee_observed_at   timestamptz;

-- A calibration outside this range is a bug or a bad log, not a metabolism.
alter table public.users
  drop constraint if exists users_tdee_calibration_range;
alter table public.users
  add constraint users_tdee_calibration_range
  check (tdee_calibration >= 0.5 and tdee_calibration <= 1.5);
