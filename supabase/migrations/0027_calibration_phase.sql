-- Scoop: establish maintenance first, then cut.
--
-- Dropping a brand-new user straight into a deficit (or into carb cycling) means
-- every target is built on the formula's guess at their burn — and Mifflin can
-- be 400 kcal out for any one person. Best practice is to eat at maintenance for
-- a short window first, learn the real burn from the scale, then open a modest
-- deficit. This adds the state that window needs:
--
--   calibration_started_at      when the maintenance-first window began. Null for
--                               users who skipped it (experienced dieters) — they
--                               still get the background TDEE correction, just no
--                               holding phase.
--   estimated_maintenance_kcal  the formula's maintenance estimate at onboarding,
--                               kept so the progress screen can show what we're
--                               calibrating from before any measurement exists.
--
-- The measured correction itself already lives in tdee_calibration / tdee_observed_*
-- (migration 0022); this only adds the phase around it.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0026.

alter table public.users
  add column if not exists calibration_started_at    timestamptz,
  add column if not exists estimated_maintenance_kcal numeric;

-- The weekly target now has one more phase it can belong to: calibration, the
-- new-user hold at maintenance. See migration 0023 for the other three.
alter table public.daily_targets
  drop constraint if exists daily_targets_phase_check;
alter table public.daily_targets
  add constraint daily_targets_phase_check
  check (phase in ('calibration', 'deficit', 'diet_break', 'maintenance'));
