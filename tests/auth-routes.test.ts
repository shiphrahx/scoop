import { beforeEach, describe, expect, it, vi } from "vitest";

// One fake Supabase client, steered per test.
const state: {
  oauthUrl: string | null;
  oauthError: { message: string } | null;
  exchangeError: { message: string } | null;
  claims: { sub: string } | null;
  redirectTo: string | null;
} = {
  oauthUrl: "https://provider.test/authorize?state=abc",
  oauthError: null,
  exchangeError: null,
  claims: null,
  redirectTo: null,
};

vi.mock("next/headers", () => ({
  cookies: async () => ({ getAll: () => [], set: () => {} }),
}));

vi.mock("@supabase/ssr", () => ({
  createServerClient: (
    _url: string,
    _key: string,
    opts: {
      cookies: {
        setAll: (
          list: { name: string; value: string; options: object }[],
          headers: Record<string, string>,
        ) => void;
      };
    },
  ) => ({
    auth: {
      async signInWithOAuth(args: { options?: { redirectTo?: string } }) {
        state.redirectTo = args.options?.redirectTo ?? null;
        if (state.oauthError) return { data: null, error: state.oauthError };
        // The real client writes the PKCE verifier through the cookie adapter.
        opts.cookies.setAll(
          [{ name: "sb-code-verifier", value: "verifier-1", options: { path: "/" } }],
          { "x-supabase-no-cache": "1" },
        );
        return { data: { url: state.oauthUrl }, error: null };
      },
      async exchangeCodeForSession() {
        if (state.exchangeError) return { error: state.exchangeError };
        opts.cookies.setAll(
          [{ name: "sb-auth-token", value: "token-1", options: { path: "/" } }],
          {},
        );
        return { error: null };
      },
      async getClaims() {
        return { data: state.claims ? { claims: state.claims } : null };
      },
    },
  }),
}));

const { GET: signin } = await import("@/app/auth/signin/route");
const { GET: callback } = await import("@/app/auth/callback/route");
const { safeNext, siteOrigin } = await import("@/lib/supabase/route");

function get(url: string, headers: Record<string, string> = {}) {
  return new Request(url, { headers });
}

function cookieNames(res: Response) {
  return res.headers
    .getSetCookie()
    .map((c) => c.split("=")[0])
    .sort();
}

beforeEach(() => {
  state.oauthUrl = "https://provider.test/authorize?state=abc";
  state.oauthError = null;
  state.exchangeError = null;
  state.claims = null;
  state.redirectTo = null;
});

describe("safeNext", () => {
  it("keeps an in-app path", () => {
    expect(safeNext("/plan/day")).toBe("/plan/day");
  });

  it("falls back to the dashboard when absent", () => {
    expect(safeNext(null)).toBe("/dashboard");
  });

  it("refuses an off-site destination", () => {
    expect(safeNext("https://evil.test/steal")).toBe("/dashboard");
    expect(safeNext("//evil.test/steal")).toBe("/dashboard");
  });
});

describe("siteOrigin", () => {
  it("uses the request origin when there is no proxy", () => {
    expect(siteOrigin(get("http://localhost:3000/auth/signin"))).toBe(
      "http://localhost:3000",
    );
  });

  it("prefers the public host the browser used", () => {
    const req = get("http://10.0.0.1/auth/signin", {
      "x-forwarded-host": "scoop.app",
      "x-forwarded-proto": "https",
    });
    expect(siteOrigin(req)).toBe("https://scoop.app");
  });
});

describe("GET /auth/signin", () => {
  it("sends the browser to the provider carrying the verifier cookie", async () => {
    const res = await signin(get("https://scoop.app/auth/signin"));

    expect(res.status).toBe(307);
    expect(res.headers.get("location")).toBe(
      "https://provider.test/authorize?state=abc",
    );
    // The whole point of the fix: the verifier leaves as a cookie on this host.
    expect(cookieNames(res)).toContain("sb-code-verifier");
    expect(res.headers.get("cache-control")).toBe("no-store");
    expect(res.headers.get("x-supabase-no-cache")).toBe("1");
  });

  it("comes back to the callback on the public host, carrying next", async () => {
    // The provider redirects to whatever we hand it, and the verifier cookie
    // only comes back on the host it was set for — the browser's, not the
    // internal one behind the proxy.
    await signin(
      get("http://10.0.0.1/auth/signin?next=/progress", {
        "x-forwarded-host": "scoop.app",
      }),
    );

    expect(state.redirectTo).toBe(
      "https://scoop.app/auth/callback?next=%2Fprogress",
    );
  });

  it("returns to login when the flow cannot start", async () => {
    state.oauthError = { message: "provider is down" };
    const res = await signin(get("https://scoop.app/auth/signin"));

    expect(res.headers.get("location")).toBe(
      "https://scoop.app/login?error=auth&reason=provider%20is%20down",
    );
  });
});

describe("GET /auth/callback", () => {
  it("signs the user in and lands them on the requested page", async () => {
    const res = await callback(
      get("https://scoop.app/auth/callback?code=abc&next=%2Fprogress"),
    );

    expect(res.headers.get("location")).toBe("https://scoop.app/progress");
    expect(cookieNames(res)).toContain("sb-auth-token");
    expect(res.headers.get("cache-control")).toBe("no-store");
  });

  it("still lets a signed-in user in when the code was already spent", async () => {
    // Refresh, back button, or a double tap replays the code and Supabase
    // answers "invalid flow state". The session cookie says it already worked.
    state.exchangeError = { message: "invalid flow state, no valid flow state found" };
    state.claims = { sub: "user-1" };

    const res = await callback(get("https://scoop.app/auth/callback?code=abc"));

    expect(res.headers.get("location")).toBe("https://scoop.app/dashboard");
  });

  it("explains a lost verifier in plain words", async () => {
    state.exchangeError = {
      message: "PKCE code verifier not found in storage",
    };

    const res = await callback(get("https://scoop.app/auth/callback?code=abc"));
    const reason = new URL(res.headers.get("location")!).searchParams.get("reason");

    expect(reason).toMatch(/Tap Continue with Google/);
    expect(reason).not.toMatch(/storage/);
  });

  it("refuses an off-site next", async () => {
    const res = await callback(
      get("https://scoop.app/auth/callback?code=abc&next=https%3A%2F%2Fevil.test"),
    );

    expect(res.headers.get("location")).toBe("https://scoop.app/dashboard");
  });

  it("surfaces a provider error when no code comes back", async () => {
    const res = await callback(
      get("https://scoop.app/auth/callback?error_description=access%20denied"),
    );
    const reason = new URL(res.headers.get("location")!).searchParams.get("reason");

    expect(reason).toBe("access denied");
  });
});
