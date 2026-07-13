-- The user's timezone, so "today" means their day and not the server's.
--
-- Vercel runs in UTC. Without this, a user in the UK between midnight and 1am
-- BST (or anyone further from UTC, for hours at a time) saw yesterday's food on
-- the home screen and logged meals onto the wrong date.
--
-- An IANA name, e.g. "Europe/London". Existing rows default to UTC, which is
-- what they were effectively getting already; the app captures the real zone
-- from the browser on the next sign-in.
alter table public.users
  add column if not exists timezone text not null default 'UTC';
