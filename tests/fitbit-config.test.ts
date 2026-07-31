import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import { providerConfigured, activeProvider, missingProviderConfig } from "@/lib/fitbit";

// Missing provider credentials used to throw from deep inside the OAuth and
// refresh calls: /api/fitbit/authorize answered with a bare 500, and a sync
// reported "that connection has expired" — sending the user to reconnect for
// something no reconnect can fix. These lock the up-front check instead.

const VARS = [
  "HEALTH_PROVIDER",
  "GOOGLE_HEALTH_CLIENT_ID",
  "GOOGLE_HEALTH_CLIENT_SECRET",
  "FITBIT_CLIENT_ID",
  "FITBIT_CLIENT_SECRET",
] as const;

let saved: Record<string, string | undefined>;

beforeEach(() => {
  saved = Object.fromEntries(VARS.map((v) => [v, process.env[v]]));
  for (const v of VARS) delete process.env[v];
  vi.spyOn(console, "error").mockImplementation(() => {});
});

afterEach(() => {
  for (const [k, v] of Object.entries(saved)) {
    if (v === undefined) delete process.env[k];
    else process.env[k] = v;
  }
});

describe("providerConfigured", () => {
  it("is false when nothing is set at all", () => {
    expect(providerConfigured()).toBe(false);
    // No HEALTH_PROVIDER means the legacy provider, which needs its own pair.
    expect(activeProvider()).toBe("legacy");
  });

  // The trap that cost the most time: HEALTH_PROVIDER=google set on one
  // environment but the Google credentials only present on another. Every call
  // then dispatches to Google with nothing to authenticate with.
  it("is false when the provider is google but its credentials are missing", () => {
    process.env.HEALTH_PROVIDER = "google";

    expect(activeProvider()).toBe("google");
    expect(providerConfigured()).toBe(false);
  });

  it("does not accept the other provider's credentials", () => {
    process.env.HEALTH_PROVIDER = "google";
    process.env.FITBIT_CLIENT_ID = "id";
    process.env.FITBIT_CLIENT_SECRET = "secret";

    expect(providerConfigured()).toBe(false);
  });

  it("needs both halves of the pair", () => {
    process.env.HEALTH_PROVIDER = "google";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";

    expect(providerConfigured()).toBe(false);
  });

  it("is true once the live provider has both", () => {
    process.env.HEALTH_PROVIDER = "google";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = "secret";

    expect(providerConfigured()).toBe(true);
  });
});

describe("missingProviderConfig", () => {
  // The exact production trap: HEALTH_PROVIDER never set on the deployment, so
  // the code falls back to legacy and looks for FITBIT_*, while the Google
  // credentials that ARE set go unread. Naming the pair it wants is the whole
  // point — "not configured" alone sends you to check the wrong two variables.
  it("names the legacy pair when HEALTH_PROVIDER is unset, even with google credentials present", () => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = "secret";

    expect(activeProvider()).toBe("legacy");
    expect(missingProviderConfig()).toEqual([
      "FITBIT_CLIENT_ID",
      "FITBIT_CLIENT_SECRET",
    ]);
  });

  it("names only the half that is actually absent", () => {
    process.env.HEALTH_PROVIDER = "google";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";

    expect(missingProviderConfig()).toEqual(["GOOGLE_HEALTH_CLIENT_SECRET"]);
  });

  it("is empty once the live provider is satisfied", () => {
    process.env.HEALTH_PROVIDER = "google";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = "secret";

    expect(missingProviderConfig()).toEqual([]);
    expect(providerConfigured()).toBe(true);
  });

  // Names are safe to surface to the signed-in owner; values never are.
  it("reports names, never values", () => {
    process.env.HEALTH_PROVIDER = "google";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "super-secret-id";

    expect(missingProviderConfig().join()).not.toMatch(/super-secret-id/);
  });
});

describe("GET /api/fitbit/authorize", () => {
  it("explains an unconfigured deployment instead of throwing a 500", async () => {
    process.env.HEALTH_PROVIDER = "google";
    const { GET } = await import("@/app/api/fitbit/authorize/route");

    const res = await GET(new NextRequest("https://scoop.app/api/fitbit/authorize"));

    expect(res.status).toBe(307);
    expect(new URL(res.headers.get("location")!).searchParams.get("fitbit")).toBe("config");
    // No point minting a CSRF state for a grant that cannot start.
    expect(res.headers.getSetCookie().join()).not.toMatch(/fitbit_oauth_state/);
  });

  it("starts the grant once configured", async () => {
    process.env.HEALTH_PROVIDER = "google";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = "secret";
    const { GET } = await import("@/app/api/fitbit/authorize/route");

    const res = await GET(new NextRequest("https://scoop.app/api/fitbit/authorize"));

    expect(res.headers.get("location")).toMatch(/accounts\.google\.com/);
    expect(res.headers.getSetCookie().join()).toMatch(/fitbit_oauth_state/);
  });
});
