import type { Client } from "pg";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  asUser,
  connect,
  hasDatabase,
  resetSchema,
  seedUsers,
  USER_A,
  USER_B,
} from "./helpers/rls-db";

// Row-level security is the thing that stops one user reading another's food
// diary, weight history and API key. It was switched on and never tested.
//
// Needs a Postgres (DATABASE_URL). CI always has one; on a laptop without one
// the suite skips rather than failing.
const suite = hasDatabase ? describe : describe.skip;

suite("row-level security", () => {
  let db: Client;

  beforeAll(async () => {
    db = await connect();
    // Applying the real migration files to an empty database also proves they
    // still apply cleanly in order — nothing else checks that either.
    await resetSchema(db);
    await seedUsers(db);
  }, 60_000);

  afterAll(async () => {
    await db?.end();
  });

  // Every table that holds a user's own data, and the column it's keyed by.
  const tables: { table: string; owner: string; insert: (id: string) => string }[] = [
    {
      table: "weights",
      owner: "user_id",
      insert: (id) => `insert into weights (user_id, weight_kg) values ('${id}', 80)`,
    },
    {
      table: "measurements",
      owner: "user_id",
      insert: (id) => `insert into measurements (user_id, waist_cm) values ('${id}', 86)`,
    },
    {
      table: "food_logs",
      owner: "user_id",
      insert: (id) =>
        `insert into food_logs (user_id, name, source, kcal, protein_g, carbs_g, fat_g)
         values ('${id}', 'Toast', 'manual', 200, 8, 30, 4)`,
    },
    {
      table: "daily_targets",
      owner: "user_id",
      insert: (id) =>
        `insert into daily_targets (user_id, week_start, kcal, protein_g, carbs_g, fat_g)
         values ('${id}', '2026-07-06', 2000, 150, 200, 65)`,
    },
    {
      table: "pantry_items",
      owner: "user_id",
      insert: (id) =>
        `insert into pantry_items (user_id, name, kcal_100g, protein_100g, carbs_100g, fat_100g)
         values ('${id}', 'Rice', 130, 2.7, 28, 0.3)`,
    },
    {
      table: "batches",
      owner: "user_id",
      insert: (id) =>
        `insert into batches (user_id, name, total_cooked_g, remaining_g, kcal, protein_g, carbs_g, fat_g)
         values ('${id}', 'Chilli', 2000, 2000, 3000, 200, 300, 100)`,
    },
    {
      table: "favourites",
      owner: "user_id",
      insert: (id) =>
        `insert into favourites (user_id, name, kcal, protein_g, carbs_g, fat_g)
         values ('${id}', 'My usual', 400, 30, 40, 12)`,
    },
    {
      table: "planned_meals",
      owner: "user_id",
      insert: (id) =>
        `insert into planned_meals (user_id, date, slot, name, kcal, protein_g, carbs_g, fat_g)
         values ('${id}', '2026-07-13', 'Dinner', 'Chicken', 600, 50, 40, 20)`,
    },
    {
      table: "activity",
      owner: "user_id",
      insert: (id) =>
        `insert into activity (user_id, date, steps, source)
         values ('${id}', '2026-07-13', 8000, 'fitbit')`,
    },
  ];

  describe.each(tables)("$table", ({ table, insert }) => {
    it("lets a user write and read back their own rows", async () => {
      await asUser(db, USER_A, (c) => c.query(insert(USER_A)));
      const { rows } = await asUser(db, USER_A, (c) =>
        c.query(`select * from ${table}`),
      );
      expect(rows.length).toBeGreaterThan(0);
    });

    it("hides another user's rows completely", async () => {
      // User B reads the table. User A has rows in it. B must see none of them.
      const { rows } = await asUser(db, USER_B, (c) =>
        c.query(`select * from ${table}`),
      );
      expect(rows).toHaveLength(0);
    });

    it("refuses a row written on another user's behalf", async () => {
      // B tries to write a row owned by A — the WITH CHECK clause must stop it.
      await expect(
        asUser(db, USER_B, (c) => c.query(insert(USER_A))),
      ).rejects.toThrow(/row-level security/i);
    });

    it("cannot update another user's rows", async () => {
      const { rowCount } = await asUser(db, USER_B, (c) =>
        c.query(`update ${table} set user_id = user_id`),
      );
      expect(rowCount).toBe(0); // A's rows aren't even visible to update
    });

    it("cannot delete another user's rows", async () => {
      const { rowCount } = await asUser(db, USER_B, (c) =>
        c.query(`delete from ${table}`),
      );
      expect(rowCount).toBe(0);

      // And A's rows really are still there.
      const { rows } = await asUser(db, USER_A, (c) =>
        c.query(`select * from ${table}`),
      );
      expect(rows.length).toBeGreaterThan(0);
    });
  });

  describe("users (the profile itself)", () => {
    it("cannot read another user's profile", async () => {
      const { rows } = await asUser(db, USER_A, (c) =>
        c.query("select * from users"),
      );
      expect(rows).toHaveLength(1);
      expect(rows[0].id).toBe(USER_A);
    });

    it("cannot read another user's stored API key", async () => {
      // The Anthropic key lives on the profile row. A leak here is the user's
      // billable credential, not just their lunch.
      await asUser(db, USER_B, (c) =>
        c.query("update users set anthropic_api_key = 'enc.v1.secret' where id = $1", [
          USER_B,
        ]),
      );

      const { rows } = await asUser(db, USER_A, (c) =>
        c.query("select anthropic_api_key from users where id = $1", [USER_B]),
      );
      expect(rows).toHaveLength(0);
    });

    it("cannot overwrite another user's profile", async () => {
      const { rowCount } = await asUser(db, USER_B, (c) =>
        c.query("update users set diet_type = 'vegan' where id = $1", [USER_A]),
      );
      expect(rowCount).toBe(0);
    });
  });

  describe("fitbit_tokens", () => {
    it("keeps one user's OAuth tokens away from another", async () => {
      await asUser(db, USER_A, (c) =>
        c.query(
          `insert into fitbit_tokens (user_id, access_token, refresh_token, expires_at)
           values ($1, 'enc.v1.access', 'enc.v1.refresh', now() + interval '1 hour')`,
          [USER_A],
        ),
      );

      const { rows } = await asUser(db, USER_B, (c) =>
        c.query("select * from fitbit_tokens"),
      );
      expect(rows).toHaveLength(0);
    });
  });

  describe("a signed-out request", () => {
    it("sees nothing at all", async () => {
      // No JWT claim → auth.uid() is null → every policy fails.
      await db.query("begin");
      await db.query("set local role authenticated");
      const { rows } = await db.query("select * from food_logs");
      await db.query("rollback");
      await db.query("reset role");
      expect(rows).toHaveLength(0);
    });
  });
});
