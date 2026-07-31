import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";

// One fake Supabase client, steered per test. `calls` counts how often the
// session was actually looked up, which is the thing the landing page's speed
// depends on.
const state: { claims: { sub: string } | null; calls: number } = {
  claims: null,
  calls: 0,
};

vi.mock("@supabase/ssr", () => ({
  createServerClient: () => ({
    auth: {
      async getClaims() {
        state.calls++;
        return { data: state.claims ? { claims: state.claims } : null };
      },
    },
  }),
}));

const { updateSession } = await import("@/lib/supabase/middleware");

// Supabase splits a large session across sb-<ref>-auth-token.0 / .1.
const SESSION_COOKIE = "sb-abcdefgh-auth-token";

function request(path: string, cookies: Record<string, string> = {}) {
  const req = new NextRequest(`https://scoop.app${path}`);
  for (const [name, value] of Object.entries(cookies)) {
    req.cookies.set(name, value);
  }
  return req;
}

const location = (res: Response) => res.headers.get("location");

beforeEach(() => {
  state.claims = null;
  state.calls = 0;
});

describe("the landing page for a signed-in visitor", () => {
  // The point of the change: opening the app lands on the day's numbers. The
  // installed app asks for /dashboard itself, but an icon installed before that
  // was set still opens "/", as does every bookmark and typed address.
  it("redirects to the dashboard", async () => {
    state.claims = { sub: "user-1" };

    const res = await updateSession(request("/", { [SESSION_COOKIE]: "tok" }));

    expect(res.status).toBe(307);
    expect(location(res)).toBe("https://scoop.app/dashboard");
  });

  it("keeps a chunked session cookie working", async () => {
    state.claims = { sub: "user-1" };

    const res = await updateSession(
      request("/", { [`${SESSION_COOKIE}.0`]: "part", [`${SESSION_COOKIE}.1`]: "part" }),
    );

    expect(location(res)).toBe("https://scoop.app/dashboard");
  });
});

describe("the landing page for everyone else", () => {
  // The marketing page is what a first-time visitor came for, and it must not
  // pay for a Supabase round trip to be told it has no session.
  it("renders without looking up a session when no cookie is present", async () => {
    const res = await updateSession(request("/"));

    expect(res.status).toBe(200);
    expect(location(res)).toBeNull();
    expect(state.calls).toBe(0);
  });

  // A cookie that no longer resolves to anyone. /login is not where someone who
  // typed the front door expects to land, so they get the page they asked for.
  it("shows the page when the cookie no longer resolves to a user", async () => {
    state.claims = null;

    const res = await updateSession(request("/", { [SESSION_COOKIE]: "stale" }));

    expect(res.status).toBe(200);
    expect(location(res)).toBeNull();
    expect(state.calls).toBe(1);
  });
});

describe("the rest of the routing", () => {
  it("still sends a signed-out visitor from a protected route to login", async () => {
    const res = await updateSession(request("/dashboard"));

    expect(location(res)).toBe("https://scoop.app/login");
  });

  it("lets a signed-in visitor through to a protected route", async () => {
    state.claims = { sub: "user-1" };

    const res = await updateSession(request("/dashboard", { [SESSION_COOKIE]: "tok" }));

    expect(res.status).toBe(200);
    expect(location(res)).toBeNull();
  });

  // These have to stay reachable with a session in hand — bouncing a signed-in
  // user off /login would trap anyone trying to switch accounts, and the PWA
  // files are fetched by the browser, not the user.
  it.each(["/login", "/privacy", "/terms", "/manifest.webmanifest", "/sw.js"])(
    "leaves %s alone even with a session cookie",
    async (path) => {
      state.claims = { sub: "user-1" };

      const res = await updateSession(request(path, { [SESSION_COOKIE]: "tok" }));

      expect(res.status).toBe(200);
      expect(location(res)).toBeNull();
      expect(state.calls).toBe(0);
    },
  );
});
