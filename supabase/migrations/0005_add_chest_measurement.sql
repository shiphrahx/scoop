-- Scoop: add a chest measurement to the weekly tape check. Run after 0004.
alter table public.measurements
  add column if not exists chest_cm numeric;
