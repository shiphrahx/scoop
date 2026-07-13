-- Scoop: stop storing the Apple ingest token in the clear.
--   apple_ingest_token       now holds the ENCRYPTED token (for re-display in
--                            Settings), not the raw value.
--   apple_ingest_token_hash  sha256 of the raw token — what the ingest endpoint
--                            looks up by, since the encrypted column uses a
--                            random IV and can't be matched on directly.
-- Run in the Supabase SQL Editor (or via the CLI) after 0011.
--
-- Existing rows keep their old plaintext token until the user regenerates it in
-- Settings; regenerating writes the encrypted value + hash and the ingest
-- endpoint then matches on the hash.

alter table public.users
  add column if not exists apple_ingest_token_hash text;

create unique index if not exists users_apple_ingest_token_hash
  on public.users (apple_ingest_token_hash)
  where apple_ingest_token_hash is not null;
