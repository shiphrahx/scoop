-- Re-state every row-level-security policy with `(select auth.uid())` in place
-- of a bare `auth.uid()`.
--
-- Why this is worth a migration: `auth.uid()` reads a GUC out of the request's
-- JWT. Written bare in a policy predicate, Postgres treats it as volatile and
-- re-evaluates it for EVERY row the query touches. Wrapped in a scalar
-- subquery it becomes an InitPlan — computed once for the whole statement and
-- then compared as a constant, which also lets the planner use the
-- (user_id, …) indexes these tables already have instead of filtering after
-- the fact. On the tables the app scans by range — food_logs over 180 days for
-- the insights dashboard, weights over a year — that is the difference between
-- an index scan and a sequential one.
--
-- The predicates are otherwise unchanged: same tables, same policy names, same
-- rows visible to the same people. This is purely how the check is evaluated.

-- --- Phase 2 tables ----------------------------------------------------------
drop policy if exists "own profile" on public.users;
create policy "own profile" on public.users
  for all using ((select auth.uid()) = id)
  with check ((select auth.uid()) = id);

drop policy if exists "own weights" on public.weights;
create policy "own weights" on public.weights
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own measurements" on public.measurements;
create policy "own measurements" on public.measurements
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own food_logs" on public.food_logs;
create policy "own food_logs" on public.food_logs
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own daily_targets" on public.daily_targets;
create policy "own daily_targets" on public.daily_targets
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- --- Phase 3 tables ----------------------------------------------------------
drop policy if exists "own favourites" on public.favourites;
create policy "own favourites" on public.favourites
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own pantry_items" on public.pantry_items;
create policy "own pantry_items" on public.pantry_items
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own batches" on public.batches;
create policy "own batches" on public.batches
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- --- Phase 4 / 5 tables ------------------------------------------------------
drop policy if exists "own recipes" on public.recipes;
create policy "own recipes" on public.recipes
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own activity" on public.activity;
create policy "own activity" on public.activity
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own fitbit_tokens" on public.fitbit_tokens;
create policy "own fitbit_tokens" on public.fitbit_tokens
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own planned meals" on public.planned_meals;
create policy "own planned meals" on public.planned_meals
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own favourite meals" on public.favourite_meals;
create policy "own favourite meals" on public.favourite_meals
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own high days" on public.high_days;
create policy "own high days" on public.high_days
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own check_ins" on public.check_ins;
create policy "own check_ins" on public.check_ins
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own check_in_photos" on public.check_in_photos;
create policy "own check_in_photos" on public.check_in_photos
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own non_scale_victories" on public.non_scale_victories;
create policy "own non_scale_victories" on public.non_scale_victories
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

drop policy if exists "own custom_milestones" on public.custom_milestones;
create policy "own custom_milestones" on public.custom_milestones
  for all using ((select auth.uid()) = user_id)
  with check ((select auth.uid()) = user_id);

-- --- Shared fresh-food reference ---------------------------------------------
-- Reads stay open to everyone (it is a shared reference table); only the
-- ownership checks on writes change.
drop policy if exists "add fresh_foods" on public.fresh_foods;
create policy "add fresh_foods" on public.fresh_foods
  for insert with check ((select auth.uid()) = created_by);

drop policy if exists "edit own fresh_foods" on public.fresh_foods;
create policy "edit own fresh_foods" on public.fresh_foods
  for update using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

drop policy if exists "delete own fresh_foods" on public.fresh_foods;
create policy "delete own fresh_foods" on public.fresh_foods
  for delete using ((select auth.uid()) = created_by);

drop policy if exists "add fresh_food_sizes" on public.fresh_food_sizes;
create policy "add fresh_food_sizes" on public.fresh_food_sizes
  for insert with check ((select auth.uid()) = created_by);

drop policy if exists "edit own fresh_food_sizes" on public.fresh_food_sizes;
create policy "edit own fresh_food_sizes" on public.fresh_food_sizes
  for update using ((select auth.uid()) = created_by)
  with check ((select auth.uid()) = created_by);

drop policy if exists "delete own fresh_food_sizes" on public.fresh_food_sizes;
create policy "delete own fresh_food_sizes" on public.fresh_food_sizes
  for delete using ((select auth.uid()) = created_by);

-- --- Private check-in photo bucket -------------------------------------------
-- storage.objects holds every user's files in one table, so a per-row
-- re-evaluation here is the worst case of the lot.
drop policy if exists "own check-in photos read" on storage.objects;
create policy "own check-in photos read" on storage.objects
  for select using (
    bucket_id = 'check-in-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "own check-in photos insert" on storage.objects;
create policy "own check-in photos insert" on storage.objects
  for insert with check (
    bucket_id = 'check-in-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );

drop policy if exists "own check-in photos delete" on storage.objects;
create policy "own check-in photos delete" on storage.objects
  for delete using (
    bucket_id = 'check-in-photos'
    and (storage.foldername(name))[1] = (select auth.uid())::text
  );
