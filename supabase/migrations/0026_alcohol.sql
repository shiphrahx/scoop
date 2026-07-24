-- Scoop: log alcoholic drinks.
--
-- Alcohol is 7 kcal/g and is neither protein, carb nor fat. Scoop tracks only
-- protein/carbs/fat, so — like every IIFYM tracker — a drink's alcohol calories
-- are booked against carbs OR fat (the user's choice per drink, based on what
-- they have left that day), while any REAL drink carbs (beer sugars, wine
-- residual sugar, mixers) are added as actual carbs on top. The daily calorie
-- total then stays correct even though no "alcohol" macro exists.
--
-- food_logs gains:
--   alcohol_g            grams of pure ethanol in the drink (history/accuracy).
--   alcohol_allocation   how the alcohol calories were booked: 'carbs', 'fat'
--                        or 'split' (half each). Null for non-alcohol logs.
-- and 'alcohol' joins the allowed sources.
--
-- users.last_alcohol_allocation remembers the user's last choice so the logger
-- can default to it next time.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0025.

alter table public.food_logs
  add column if not exists alcohol_g          numeric,
  add column if not exists alcohol_allocation text;

alter table public.food_logs
  drop constraint if exists food_logs_source_check;
alter table public.food_logs
  add constraint food_logs_source_check
  check (source in ('batch', 'barcode', 'recipe', 'manual', 'alcohol'));

alter table public.food_logs
  drop constraint if exists food_logs_alcohol_allocation_check;
alter table public.food_logs
  add constraint food_logs_alcohol_allocation_check
  check (alcohol_allocation is null or alcohol_allocation in ('carbs', 'fat', 'split'));

alter table public.users
  add column if not exists last_alcohol_allocation text;

alter table public.users
  drop constraint if exists users_last_alcohol_allocation_check;
alter table public.users
  add constraint users_last_alcohol_allocation_check
  check (last_alcohol_allocation is null or last_alcohol_allocation in ('carbs', 'fat', 'split'));
