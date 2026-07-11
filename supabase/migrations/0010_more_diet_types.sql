-- Scoop: widen the diet options. The new-user flow now offers pescatarian,
-- keto, and celiac (gluten-free) alongside regular / vegetarian / vegan.
-- Run in the Supabase SQL Editor (or via the CLI) after 0009.

alter table public.users
  drop constraint if exists users_diet_type_check;

alter table public.users
  add constraint users_diet_type_check
    check (diet_type in
      ('regular', 'vegetarian', 'vegan', 'pescatarian', 'keto', 'celiac'));
