import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { installFakeSupabase } from "./helpers/fake-supabase";

vi.mock("@/lib/supabase/server", async () => {
  const { supabaseHolder } = await import("./helpers/fake-supabase");
  return { createClient: async () => supabaseHolder.client };
});
vi.mock("next/cache", () => ({ revalidatePath: () => {}, revalidateTag: () => {} }));

// The provider boundary. Everything below the dispatch in lib/fitbit is wire
// calls, so the two functions syncFitbit reaches for are mocked here.
const getDay = vi.fn();
const refreshTokens = vi.fn();
vi.mock("@/lib/fitbit", () => ({
  getDay: (...a: unknown[]) => getDay(...a),
  refreshTokens: (...a: unknown[]) => refreshTokens(...a),
}));

const { syncFitbit } = await import("@/app/(app)/coach/actions");
const { encryptSecret } = await import("@/lib/crypto");

const HOUR = 3_600_000;
let savedKey: string | undefined;

beforeAll(() => {
  savedKey = process.env.SECRET_ENCRYPTION_KEY;
  process.env.SECRET_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString("base64");
});

afterAll(() => {
  if (savedKey === undefined) delete process.env.SECRET_ENCRYPTION_KEY;
  else process.env.SECRET_ENCRYPTION_KEY = savedKey;
});

beforeEach(() => {
  getDay.mockReset();
  refreshTokens.mockReset();
  // Quiet the deliberate logError writes on the failure paths.
  vi.spyOn(console, "error").mockImplementation(() => {});
});

// A connected user whose access token is still valid, so no refresh is needed.
function connected(expiresInMs = HOUR) {
  return installFakeSupabase({
    db: {
      users: [{ id: "user-1" }],
      activity: [],
      fitbit_tokens: [
        {
          user_id: "user-1",
          access_token: encryptSecret("access-tok"),
          refresh_token: encryptSecret("refresh-tok"),
          expires_at: new Date(Date.now() + expiresInMs).toISOString(),
        },
      ],
    },
  });
}

const fullDay = async (_t: string, date: string) => ({
  date,
  steps: 9000,
  workout_kcal: 400,
  sleep_hours: 7,
});

const emptyDay = async (_t: string, date: string) => ({
  date,
  steps: null,
  workout_kcal: null,
  sleep_hours: null,
});

describe("syncFitbit", () => {
  it("writes the week and reports how many days it got", async () => {
    const { db } = connected();
    getDay.mockImplementation(fullDay);

    const res = await syncFitbit();

    expect(res).toEqual({ ok: true, message: "Synced 7 days." });
    expect(db.activity).toHaveLength(7);
    expect(db.activity[0]).toMatchObject({ user_id: "user-1", source: "fitbit" });
  });

  it("says to connect when there are no tokens", async () => {
    installFakeSupabase({ db: { users: [{ id: "user-1" }], fitbit_tokens: [], activity: [] } });

    const res = await syncFitbit();

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/connect/i);
    expect(getDay).not.toHaveBeenCalled();
  });

  // The failure the issue was actually hitting: a token the user revoked at the
  // provider. It surfaced as Next's redacted server-error text, which told them
  // nothing. Reconnecting is the only fix, so the message has to say so.
  it("asks the user to reconnect when the refresh is rejected", async () => {
    connected(-HOUR); // expired, forcing a refresh
    refreshTokens.mockRejectedValue(new Error("Google token refresh failed (400)."));

    const res = await syncFitbit();

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/expired|connect again/i);
    // The provider's own wording never reaches the user.
    expect(res.message).not.toMatch(/400/);
    expect(getDay).not.toHaveBeenCalled();
    // Telling someone to reconnect is useless unless the UI can offer the
    // button. Without this flag the message was a dead end: the Connect link
    // only showed when no token row existed, which is never true here.
    expect(res.reconnect).toBe(true);
  });

  // A key that can no longer decrypt what we stored is our problem, not a
  // connection the user let lapse — it shouldn't be reported as one, though
  // reconnecting does replace the unreadable token.
  it("separates an unreadable stored token from an expired connection", async () => {
    const { db } = connected();
    db.fitbit_tokens[0].access_token = "enc.v1.this-is-not-decryptable";

    const res = await syncFitbit();

    expect(res.ok).toBe(false);
    expect(res.reconnect).toBe(true);
    expect(res.message).toMatch(/could not be read/i);
    expect(res.message).not.toMatch(/expired/i);
    expect(refreshTokens).not.toHaveBeenCalled();
  });

  // Only a dead connection gets the button — a transient provider wobble or a
  // quiet week must not push the user through a fresh grant for nothing.
  it("does not ask for a reconnect on a recoverable failure", async () => {
    connected();
    getDay.mockImplementation(emptyDay);

    const res = await syncFitbit();

    expect(res.ok).toBe(false);
    expect(res.reconnect).toBeFalsy();
  });

  it("refreshes an expiring token and stores the new one", async () => {
    const { db } = connected(-HOUR);
    refreshTokens.mockResolvedValue({
      access_token: "fresh-tok",
      refresh_token: "fresh-refresh",
      expires_at: new Date(Date.now() + HOUR).toISOString(),
      scope: "activity sleep",
      fitbit_user_id: null,
    });
    getDay.mockImplementation(fullDay);

    const res = await syncFitbit();

    expect(res.ok).toBe(true);
    // The days were fetched with the refreshed token, not the stale one.
    expect(getDay.mock.calls.every((c) => c[0] === "fresh-tok")).toBe(true);
    // And it was written back encrypted, not in the clear.
    const stored = db.fitbit_tokens[0].access_token as string;
    expect(stored).not.toBe("fresh-tok");
    expect(stored.startsWith("enc.v1.")).toBe(true);
  });

  it("reports an empty week rather than claiming success", async () => {
    const { db } = connected();
    getDay.mockImplementation(emptyDay);

    const res = await syncFitbit();

    expect(res.ok).toBe(false);
    expect(res.message).toMatch(/no activity/i);
    expect(db.activity).toHaveLength(0);
  });

  it("does not throw when the provider call blows up", async () => {
    connected();
    getDay.mockRejectedValue(new Error("socket hang up"));

    const res = await syncFitbit();

    expect(res.ok).toBe(false);
    expect(res.message).not.toMatch(/socket hang up/);
  });
});
