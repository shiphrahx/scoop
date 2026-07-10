-- Scoop: track more nutrients than the core three. Users choose which nutrients
-- to see (protein/carbs/fat plus fiber, sugar, saturates, sodium); we store the
-- values on foods, log totals, and weekly targets so the same set shows
-- everywhere. Weights are grams; sodium is milligrams. Run after 0008.

-- Which nutrients the user wants shown in breakdowns (kcal is always the hero).
alter table public.users
  add column if not exists nutrient_prefs text[] not null
    default '{protein,carbs,fat}';

-- Per-100g values on pantry items (null/0 when the source didn't report them).
alter table public.pantry_items
  add column if not exists fiber_100g     numeric not null default 0,
  add column if not exists sugar_100g     numeric not null default 0,
  add column if not exists satfat_100g    numeric not null default 0,
  add column if not exists sodium_mg_100g numeric not null default 0;

-- Logged totals per food entry.
alter table public.food_logs
  add column if not exists fiber_g   numeric not null default 0,
  add column if not exists sugar_g   numeric not null default 0,
  add column if not exists satfat_g  numeric not null default 0,
  add column if not exists sodium_mg numeric not null default 0;

-- Totals on a planned meal.
alter table public.planned_meals
  add column if not exists fiber_g   numeric not null default 0,
  add column if not exists sugar_g   numeric not null default 0,
  add column if not exists satfat_g  numeric not null default 0,
  add column if not exists sodium_mg numeric not null default 0;

-- Weekly targets for the extra nutrients (fiber is a floor to aim for; sugar,
-- saturates and sodium are ceilings to stay under).
alter table public.daily_targets
  add column if not exists fiber_g   numeric not null default 0,
  add column if not exists sugar_g   numeric not null default 0,
  add column if not exists satfat_g  numeric not null default 0,
  add column if not exists sodium_mg numeric not null default 0;
