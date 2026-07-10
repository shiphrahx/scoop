import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeUrl,
  exchangeCode,
  getDay,
  redirectUri,
  refreshTokens,
} from "@/lib/fitbit";

describe("redirectUri", () => {
  it("appends the callback path to the origin", () => {
    expect(redirectUri("https://scoop.app")).toBe(
      "https://scoop.app/api/fitbit/callback",
    );
  });
});

describe("authorizeUrl", () => {
  const OLD = process.env.FITBIT_CLIENT_ID;
  beforeEach(() => {
    process.env.FITBIT_CLIENT_ID = "abc123";
  });
  afterEach(() => {
    process.env.FITBIT_CLIENT_ID = OLD;
  });

  it("builds an authorize URL carrying the client id, scope, redirect and state", () => {
    const url = new URL(authorizeUrl("https://scoop.app", "xyz-state"));
    expect(url.origin + url.pathname).toBe(
      "https://www.fitbit.com/oauth2/authorize",
    );
    expect(url.searchParams.get("client_id")).toBe("abc123");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("scope")).toBe("activity sleep");
    expect(url.searchParams.get("state")).toBe("xyz-state");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://scoop.app/api/fitbit/callback",
    );
  });

  it("throws when the client id env var is unset", () => {
    delete process.env.FITBIT_CLIENT_ID;
    expect(() => authorizeUrl("https://scoop.app", "s")).toThrow(/FITBIT_CLIENT_ID/);
  });
});

// --- Token + day fetches (fetch mocked) -------------------------------------

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  process.env.FITBIT_CLIENT_ID = "id";
  process.env.FITBIT_CLIENT_SECRET = "secret";
  vi.stubGlobal("fetch", fetchMock);
  fetchMock.mockReset();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("exchangeCode", () => {
  it("shapes the token response and derives an ISO expiry", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-07-10T00:00:00Z"));
    fetchMock.mockResolvedValueOnce(
      jsonResponse({
        access_token: "at",
        refresh_token: "rt",
        expires_in: 3600,
        scope: "activity sleep",
        user_id: "FBUSER",
      }),
    );

    const tokens = await exchangeCode("one-time-code", "https://scoop.app");
    expect(tokens.access_token).toBe("at");
    expect(tokens.refresh_token).toBe("rt");
    expect(tokens.scope).toBe("activity sleep");
    expect(tokens.fitbit_user_id).toBe("FBUSER");
    // now + 3600s
    expect(tokens.expires_at).toBe("2026-07-10T01:00:00.000Z");
    vi.useRealTimers();
  });

  it("throws when Fitbit rejects the code", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(exchangeCode("bad", "https://scoop.app")).rejects.toThrow(/401/);
  });
});

describe("refreshTokens", () => {
  it("throws when the refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 400));
    await expect(refreshTokens("rt")).rejects.toThrow(/400/);
  });

  it("defaults scope and user id to null when absent", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "a", refresh_token: "r", expires_in: 10 }),
    );
    const t = await refreshTokens("rt");
    expect(t.scope).toBeNull();
    expect(t.fitbit_user_id).toBeNull();
  });
});

describe("getDay", () => {
  it("maps steps, activity calories and sleep minutes into our shape", async () => {
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ summary: { steps: 8123, activityCalories: 540 } }),
      )
      .mockResolvedValueOnce(
        jsonResponse({ summary: { totalMinutesAsleep: 435 } }),
      );

    const day = await getDay("token", "2026-07-05");
    expect(day.date).toBe("2026-07-05");
    expect(day.steps).toBe(8123);
    expect(day.workout_kcal).toBe(540);
    // 435 min = 7.25 h → rounded to 7.3 (one decimal)
    expect(day.sleep_hours).toBe(7.3);
  });

  it("returns nulls for pieces a failed request could not supply", async () => {
    // Activity request 404s (getJson → null), sleep returns no summary.
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false, 404))
      .mockResolvedValueOnce(jsonResponse({}));

    const day = await getDay("token", "2026-07-06");
    expect(day.steps).toBeNull();
    expect(day.workout_kcal).toBeNull();
    expect(day.sleep_hours).toBeNull();
  });
});
