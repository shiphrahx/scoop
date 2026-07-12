-- Scoop: collect body-fat % and a numeric goal weight at onboarding.
--   body_fat_pct   optional — when known, the Coach uses the Katch–McArdle BMR
--                  (driven by lean mass) instead of Mifflin–St Jeor for a more
--                  accurate calorie target. Null = estimate from height/weight.
--   goal_weight_kg the user's target weight. Used as the "target weight" that
--                  caps the protein basis (better than the BMI-25 proxy).
-- Run in the Supabase SQL Editor (or via the CLI) after 0010.

alter table public.users
  add column if not exists body_fat_pct   numeric,
  add column if not exists goal_weight_kg numeric;
