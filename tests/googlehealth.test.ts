import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import {
  authorizeUrl,
  exchangeCode,
  getDay,
  redirectUri,
  refreshTokens,
} from "@/lib/googlehealth";

describe("redirectUri", () => {
  it("reuses the existing callback path", () => {
    expect(redirectUri("https://scoop.app")).toBe(
      "https://scoop.app/api/fitbit/callback",
    );
  });
});

describe("authorizeUrl", () => {
  const OLD = process.env.GOOGLE_HEALTH_CLIENT_ID;
  beforeEach(() => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = "goog-id";
  });
  afterEach(() => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = OLD;
  });

  it("points at Google OAuth and asks for offline access", () => {
    const url = new URL(authorizeUrl("https://scoop.app", "st8"));
    expect(url.origin + url.pathname).toBe(
      "https://accounts.google.com/o/oauth2/v2/auth",
    );
    expect(url.searchParams.get("client_id")).toBe("goog-id");
    expect(url.searchParams.get("response_type")).toBe("code");
    expect(url.searchParams.get("state")).toBe("st8");
    expect(url.searchParams.get("redirect_uri")).toBe(
      "https://scoop.app/api/fitbit/callback",
    );
    // Without these Google never returns a refresh token.
    expect(url.searchParams.get("access_type")).toBe("offline");
    expect(url.searchParams.get("prompt")).toBe("consent");
    // Both read scopes requested.
    const scope = url.searchParams.get("scope") ?? "";
    expect(scope).toContain("googlehealth.activity_and_fitness.readonly");
    expect(scope).toContain("googlehealth.sleep.readonly");
  });

  it("throws when the client id env var is unset", () => {
    delete process.env.GOOGLE_HEALTH_CLIENT_ID;
    expect(() => authorizeUrl("https://scoop.app", "s")).toThrow(
      /GOOGLE_HEALTH_CLIENT_ID/,
    );
  });
});

// --- Token + day fetches (fetch mocked) -------------------------------------

const fetchMock = vi.fn();

function jsonResponse(body: unknown, ok = true, status = 200) {
  return { ok, status, json: async () => body } as unknown as Response;
}

beforeEach(() => {
  process.env.GOOGLE_HEALTH_CLIENT_ID = "id";
  process.env.GOOGLE_HEALTH_CLIENT_SECRET = "secret";
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
        scope: "a b",
      }),
    );

    const tokens = await exchangeCode("code", "https://scoop.app");
    expect(tokens.access_token).toBe("at");
    expect(tokens.refresh_token).toBe("rt");
    expect(tokens.scope).toBe("a b");
    // Google's token endpoint carries no user id.
    expect(tokens.fitbit_user_id).toBeNull();
    expect(tokens.expires_at).toBe("2026-07-10T01:00:00.000Z");
    vi.useRealTimers();
  });

  it("throws when Google rejects the code", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 400));
    await expect(exchangeCode("bad", "https://scoop.app")).rejects.toThrow(/400/);
  });
});

describe("refreshTokens", () => {
  it("keeps the old refresh token when Google omits a new one", async () => {
    fetchMock.mockResolvedValueOnce(
      jsonResponse({ access_token: "fresh", expires_in: 3600 }),
    );
    const t = await refreshTokens("old-refresh");
    expect(t.access_token).toBe("fresh");
    // Google doesn't reissue the refresh token on refresh — carry it forward.
    expect(t.refresh_token).toBe("old-refresh");
  });

  it("throws when the refresh fails", async () => {
    fetchMock.mockResolvedValueOnce(jsonResponse({}, false, 401));
    await expect(refreshTokens("rt")).rejects.toThrow(/401/);
  });
});

describe("getDay", () => {
  it("maps the v4 rollup values into our day shape", async () => {
    // Order matches getDay's Promise.all: steps, active-energy, sleep.
    fetchMock
      .mockResolvedValueOnce(
        jsonResponse({ rollupDataPoints: [{ value: { steps: { count: "8123" } } }] }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rollupDataPoints: [
            { value: { activeEnergyBurned: { energy: { kcal: 540 } } } },
          ],
        }),
      )
      .mockResolvedValueOnce(
        jsonResponse({
          rollupDataPoints: [
            { value: { sleep: { sleepSummary: { minutesAsleep: "435" } } } },
          ],
        }),
      );

    const day = await getDay("token", "2026-07-05");
    expect(day.date).toBe("2026-07-05");
    expect(day.steps).toBe(8123);
    expect(day.workout_kcal).toBe(540);
    expect(day.sleep_hours).toBe(7.3); // 435 min → 7.25 h → 7.3
  });

  it("returns nulls for pieces a failed or empty rollup can't supply", async () => {
    fetchMock
      .mockResolvedValueOnce(jsonResponse({}, false, 404)) // steps request fails
      .mockResolvedValueOnce(jsonResponse({ rollupDataPoints: [] })) // no energy point
      .mockResolvedValueOnce(jsonResponse({ rollupDataPoints: [{ value: {} }] })); // no sleep

    const day = await getDay("token", "2026-07-06");
    expect(day.steps).toBeNull();
    expect(day.workout_kcal).toBeNull();
    expect(day.sleep_hours).toBeNull();
  });

  it("POSTs a one-day civil range to the dailyRollUp endpoint", async () => {
    fetchMock.mockResolvedValue(jsonResponse({ rollupDataPoints: [] }));
    await getDay("token", "2026-07-05");

    const [url, init] = fetchMock.mock.calls[0];
    expect(String(url)).toContain(
      "/dataTypes/steps/dataPoints:dailyRollUp",
    );
    expect(init.method).toBe("POST");
    const body = JSON.parse(init.body);
    expect(body.windowSizeDays).toBe(1);
    expect(body.range.startTime).toEqual({
      year: 2026,
      month: 7,
      day: 5,
      hours: 0,
      minutes: 0,
      seconds: 0,
    });
    // Exclusive next-midnight end.
    expect(body.range.endTime.day).toBe(6);
  });
});
