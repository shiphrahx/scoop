import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// The provider exchange, steered per test.
const exchangeCode = vi.fn();
vi.mock("@/lib/fitbit", () => ({ exchangeCode: (...a: unknown[]) => exchangeCode(...a) }));

// The connect path also kicks off a first sync; it is not what's under test.
vi.mock("@/lib/activity-sync", () => ({ syncActivityDays: vi.fn().mockResolvedValue({}) }));
vi.mock("@/lib/crypto", () => ({ encryptSecret: (s: string) => `enc:${s}` }));

const upsert = vi.fn();
vi.mock("@/lib/supabase/server", () => ({
  createClient: async () => ({
    auth: { getUser: async () => ({ data: { user: { id: "user-1" } } }) },
    from: () => ({ upsert: (...a: unknown[]) => upsert(...a) }),
  }),
}));

const { GET } = await import("@/app/api/fitbit/callback/route");

function callback() {
  const req = new NextRequest("https://scoop.app/api/fitbit/callback?code=abc&state=s1");
  req.cookies.set("fitbit_oauth_state", "s1");
  return req;
}

const dest = (res: Response) => new URL(res.headers.get("location")!);

beforeEach(() => {
  exchangeCode.mockReset();
  upsert.mockReset().mockResolvedValue({ error: null });
  vi.spyOn(console, "error").mockImplementation(() => {});
});

describe("GET /api/fitbit/callback", () => {
  it("stores a grant that came with offline access", async () => {
    exchangeCode.mockResolvedValue({
      access_token: "at",
      refresh_token: "rt",
      expires_at: new Date().toISOString(),
      scope: "activity sleep",
      fitbit_user_id: null,
    });

    const res = await GET(callback());

    expect(dest(res).searchParams.get("fitbit")).toBe("connected");
    expect(upsert).toHaveBeenCalled();
  });

  // A grant with no refresh token works until the access token lapses, about an
  // hour, and can then never be renewed. Stored, it dies quietly long after the
  // user connected and shows up as "that connection has expired" with nothing
  // pointing at the real cause. Refuse it while the cause is still on screen.
  it("refuses a grant with no refresh token instead of storing a doomed one", async () => {
    exchangeCode.mockResolvedValue({
      access_token: "at",
      refresh_token: "",
      expires_at: new Date().toISOString(),
      scope: "activity sleep",
      fitbit_user_id: null,
    });

    const res = await GET(callback());

    expect(dest(res).searchParams.get("fitbit")).toBe("offline");
    // The half-usable connection must not reach the database.
    expect(upsert).not.toHaveBeenCalled();
  });

  it("reports a failed exchange separately from a missing refresh token", async () => {
    exchangeCode.mockRejectedValue(new Error("Google token exchange failed (400)."));

    const res = await GET(callback());

    expect(dest(res).searchParams.get("fitbit")).toBe("error");
    expect(upsert).not.toHaveBeenCalled();
  });

  it("rejects a mismatched CSRF state without touching the provider", async () => {
    const req = new NextRequest("https://scoop.app/api/fitbit/callback?code=abc&state=s1");
    req.cookies.set("fitbit_oauth_state", "different");

    const res = await GET(req);

    expect(dest(res).searchParams.get("fitbit")).toBe("error");
    expect(exchangeCode).not.toHaveBeenCalled();
  });
});
