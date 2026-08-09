-- Scoop: private storage bucket for progress photos.
--
-- Progress photos are sensitive and private by default. The bucket is NOT
-- public, so files are never reachable by URL, the app serves each one through
-- a short-lived signed URL it mints server-side. Every object is stored under a
-- top-level folder named for the owner's user id, and the policies below only
-- let a user touch objects in their own folder.
--
-- Run in the Supabase SQL Editor (or via the CLI) after 0028.

insert into storage.buckets (id, name, public)
values ('check-in-photos', 'check-in-photos', false)
on conflict (id) do update set public = false;

-- Path layout: <user_id>/<check_in_id>/<file>. (storage.foldername(name))[1] is
-- the first path segment, the owner's id, so a user only ever sees or writes
-- their own files.
drop policy if exists "own check-in photos read" on storage.objects;
create policy "own check-in photos read" on storage.objects
  for select using (
    bucket_id = 'check-in-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own check-in photos insert" on storage.objects;
create policy "own check-in photos insert" on storage.objects
  for insert with check (
    bucket_id = 'check-in-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );

drop policy if exists "own check-in photos delete" on storage.objects;
create policy "own check-in photos delete" on storage.objects
  for delete using (
    bucket_id = 'check-in-photos'
    and (storage.foldername(name))[1] = auth.uid()::text
  );
