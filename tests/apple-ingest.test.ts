import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// Control the fake admin client per test.
const state: {
  userId: string | null;
  upsertError: { message: string } | null;
  upsertedRows: unknown[] | null;
} = { userId: "user-1", upsertError: null, upsertedRows: null };

vi.mock("@/lib/supabase/admin", () => ({
  createAdminClient: () => ({
    from(table: string) {
      if (table === "users") {
        return {
          select: () => ({
            eq: () => ({
              maybeSingle: async () =>
                state.userId ? { data: { id: state.userId } } : { data: null },
            }),
          }),
        };
      }
      // activity
      return {
        upsert: async (rows: unknown[]) => {
          state.upsertedRows = rows;
          return { error: state.upsertError };
        },
      };
    },
  }),
}));

// Import after the mock is registered.
const { POST } = await import("@/app/api/ingest/apple/route");

function post(body: unknown, opts: { token?: string; bearer?: string; raw?: string } = {}) {
  const url = new URL("http://localhost/api/ingest/apple");
  if (opts.token) url.searchParams.set("token", opts.token);
  const headers: Record<string, string> = { "content-type": "application/json" };
  if (opts.bearer) headers.authorization = `Bearer ${opts.bearer}`;
  return new NextRequest(url, {
    method: "POST",
    headers,
    body: opts.raw ?? JSON.stringify(body),
  });
}

beforeEach(() => {
  state.userId = "user-1";
  state.upsertError = null;
  state.upsertedRows = null;
});

describe("POST /api/ingest/apple", () => {
  it("401s when no token is supplied", async () => {
    const res = await POST(post({}, {}));
    expect(res.status).toBe(401);
    expect(await res.json()).toEqual({ error: "missing_token" });
  });

  it("400s on malformed JSON", async () => {
    const res = await POST(post(null, { token: "t", raw: "{ not json" }));
    expect(res.status).toBe(400);
    expect(await res.json()).toEqual({ error: "bad_json" });
  });

  it("403s when the token matches no user", async () => {
    state.userId = null;
    const res = await POST(post({ data: { metrics: [] } }, { token: "nope" }));
    expect(res.status).toBe(403);
    expect(await res.json()).toEqual({ error: "bad_token" });
  });

  it("accepts a Bearer token in the Authorization header", async () => {
    const res = await POST(post({ data: { metrics: [] } }, { bearer: "t" }));
    expect(res.status).toBe(200);
  });

  it("reports 0 days when there is nothing to store", async () => {
    const res = await POST(post({ data: { metrics: [] } }, { token: "t" }));
    expect(await res.json()).toEqual({ ok: true, days: 0 });
    expect(state.upsertedRows).toBeNull();
  });

  it("folds several metrics into one row per day", async () => {
    const body = {
      data: {
        metrics: [
          {
            name: "step_count",
            data: [{ date: "2026-07-05 00:00:00 +0000", qty: 8123 }],
          },
          {
            name: "active_energy",
            data: [{ date: "2026-07-05 12:00:00 +0000", qty: 540 }],
          },
          {
            name: "sleep_analysis",
            data: [{ date: "2026-07-05 06:00:00 +0000", asleep: 7.25 }],
          },
        ],
      },
    };
    const res = await POST(post(body, { token: "t" }));
    expect(await res.json()).toEqual({ ok: true, days: 1 });
    const rows = state.upsertedRows as Array<Record<string, unknown>>;
    expect(rows).toHaveLength(1);
    expect(rows[0]).toMatchObject({
      user_id: "user-1",
      date: "2026-07-05",
      steps: 8123,
      workout_kcal: 540,
      sleep_hours: 7.3, // rounded to one decimal
      source: "apple",
    });
  });

  it("splits points across days and skips undated points", async () => {
    const body = {
      data: {
        metrics: [
          {
            name: "step_count",
            data: [
              { date: "2026-07-05 00:00:00 +0000", qty: 100 },
              { date: "2026-07-06 00:00:00 +0000", qty: 200 },
              { date: "garbage", qty: 999 },
            ],
          },
        ],
      },
    };
    const res = await POST(post(body, { token: "t" }));
    expect(await res.json()).toEqual({ ok: true, days: 2 });
  });

  it("falls back through sleep fields (totalSleep, qty)", async () => {
    const body = {
      data: {
        metrics: [
          {
            name: "sleep_analysis",
            data: [{ date: "2026-07-05 00:00:00 +0000", totalSleep: 8 }],
          },
        ],
      },
    };
    await POST(post(body, { token: "t" }));
    const rows = state.upsertedRows as Array<Record<string, unknown>>;
    expect(rows[0].sleep_hours).toBe(8);
  });

  it("stores null for a non-numeric quantity", async () => {
    const body = {
      data: {
        metrics: [
          {
            name: "step_count",
            data: [{ date: "2026-07-05 00:00:00 +0000", qty: "lots" }],
          },
        ],
      },
    };
    await POST(post(body, { token: "t" }));
    const rows = state.upsertedRows as Array<Record<string, unknown>>;
    expect(rows[0].steps).toBeNull();
  });

  it("500s when the database write fails", async () => {
    state.upsertError = { message: "boom" };
    const body = {
      data: {
        metrics: [
          { name: "step_count", data: [{ date: "2026-07-05 00:00:00 +0000", qty: 1 }] },
        ],
      },
    };
    const res = await POST(post(body, { token: "t" }));
    expect(res.status).toBe(500);
    expect(await res.json()).toEqual({ error: "write_failed" });
  });
});
