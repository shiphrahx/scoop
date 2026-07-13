import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { Client } from "pg";

// Boots a real Postgres with our migrations applied so the RLS policies can be
// tested for what they actually are, rather than for what we believe they are.
//
// The app is now careful to filter by user_id itself, but RLS is the thing that
// has to hold when a query somewhere forgets — it's the last line between one
// user's food diary and another's. Nothing was checking it.
//
// Runs against DATABASE_URL. Without one the RLS suite skips, so `npm test` on a
// laptop with no Postgres still works; CI always sets it.

export const DATABASE_URL = process.env.DATABASE_URL;
export const hasDatabase = Boolean(DATABASE_URL);

const MIGRATIONS_DIR = join(process.cwd(), "supabase", "migrations");

// Supabase gives every project an `auth` schema and an `auth.uid()` that reads
// the signed-in user out of the request's JWT claims. Our migrations reference
// both, so a plain Postgres needs a stand-in before they'll apply. This mirrors
// how Supabase does it: the claim is a GUC set per transaction.
const AUTH_SCHEMA = `
  create schema if not exists auth;

  create table if not exists auth.users (
    id uuid primary key,
    email text
  );

  create or replace function auth.uid() returns uuid
    language sql stable
  as $$
    select nullif(
      current_setting('request.jwt.claim.sub', true),
      ''
    )::uuid
  $$;

  -- The roles PostgREST connects as.
  do $$
  begin
    if not exists (select 1 from pg_roles where rolname = 'anon') then
      create role anon nologin;
    end if;
    if not exists (select 1 from pg_roles where rolname = 'authenticated') then
      create role authenticated nologin;
    end if;
  end
  $$;
`;

export async function connect(): Promise<Client> {
  const client = new Client({ connectionString: DATABASE_URL });
  await client.connect();
  return client;
}

// Drop everything and rebuild from the migrations, in order. Running the real
// migration files is the point: it proves they still apply to a clean database,
// which nothing else checks either.
export async function resetSchema(client: Client): Promise<void> {
  await client.query(`
    drop schema if exists public cascade;
    drop schema if exists auth cascade;
    create schema public;
  `);
  await client.query(AUTH_SCHEMA);

  const files = readdirSync(MIGRATIONS_DIR)
    .filter((f) => f.endsWith(".sql"))
    .sort(); // 0001_, 0002_, … apply in order

  for (const file of files) {
    const sql = readFileSync(join(MIGRATIONS_DIR, file), "utf8");
    try {
      await client.query(sql);
    } catch (e) {
      throw new Error(`Migration ${file} failed: ${(e as Error).message}`);
    }
  }

  // Let the app's role reach the tables at all; RLS is what narrows it to rows.
  await client.query(`
    grant usage on schema public to authenticated, anon;
    grant all on all tables in schema public to authenticated;
    grant all on all sequences in schema public to authenticated;
  `);
}

export const USER_A = "11111111-1111-1111-1111-111111111111";
export const USER_B = "22222222-2222-2222-2222-222222222222";

export async function seedUsers(client: Client): Promise<void> {
  await client.query(
    `insert into auth.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')
     on conflict (id) do nothing`,
    [USER_A, USER_B],
  );
  await client.query(
    `insert into public.users (id, email) values ($1, 'a@example.com'), ($2, 'b@example.com')
     on conflict (id) do nothing`,
    [USER_A, USER_B],
  );
}

// Run a query as a signed-in user: the `authenticated` role, with their id in
// the JWT claim that auth.uid() reads — exactly the context a request from the
// app arrives in. Wrapped in a transaction so the settings are local to it.
export async function asUser<T>(
  client: Client,
  userId: string,
  run: (c: Client) => Promise<T>,
): Promise<T> {
  await client.query("begin");
  try {
    await client.query("set local role authenticated");
    await client.query("select set_config('request.jwt.claim.sub', $1, true)", [
      userId,
    ]);
    const result = await run(client);
    await client.query("commit");
    return result;
  } catch (e) {
    await client.query("rollback");
    throw e;
  } finally {
    await client.query("reset role");
  }
}
