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

describe("selecting the provider from HEALTH_PROVIDER", () => {
  // A near miss used to fall through to legacy in silence, and the app then
  // looked for FITBIT_* credentials a migrated deployment has no reason to hold.
  it.each(["Google", "GOOGLE", " google", "google ", "\tgoogle\n"])(
    "reads %j as google",
    (value) => {
      process.env.HEALTH_PROVIDER = value;

      expect(activeProvider()).toBe("google");
    },
  );

  it("still treats an absent or unrelated value as legacy", () => {
    expect(activeProvider()).toBe("legacy");

    process.env.HEALTH_PROVIDER = "fitbit";
    expect(activeProvider()).toBe("legacy");
  });
});

// The production failure this whole thread came down to: HEALTH_PROVIDER never
// reached the deployment, so a perfectly good set of Google credentials was
// ignored in favour of hunting for FITBIT_* that no migrated deployment holds.
describe("falling back to whichever credentials exist", () => {
  it("uses google when only google credentials are present", () => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = "secret";

    expect(activeProvider()).toBe("google");
    expect(providerConfigured()).toBe(true);
    expect(missingProviderConfig()).toEqual([]);
  });

  it("uses legacy when only fitbit credentials are present", () => {
    process.env.FITBIT_CLIENT_ID = "id";
    process.env.FITBIT_CLIENT_SECRET = "secret";

    expect(activeProvider()).toBe("legacy");
    expect(providerConfigured()).toBe(true);
  });

  // Inference is a safety net for an unambiguous deployment, never a way to
  // overrule someone who said what they wanted.
  it("never overrides an explicit setting", () => {
    process.env.HEALTH_PROVIDER = "legacy";
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id";
    process.env.GOOGLE_HEALTH_CLIENT_SECRET = "secret";

    expect(activeProvider()).toBe("legacy");
  });

  it("stays on the old default when both pairs are present", () => {
    for (const k of [
      "GOOGLE_HEALTH_CLIENT_ID",
      "GOOGLE_HEALTH_CLIENT_SECRET",
      "FITBIT_CLIENT_ID",
      "FITBIT_CLIENT_SECRET",
    ]) {
      process.env[k] = "x";
    }

    expect(activeProvider()).toBe("legacy");
  });

  it("stays on the old default when a pair is only half present", () => {
    process.env.GOOGLE_HEALTH_CLIENT_ID = "id"; // no secret

    expect(activeProvider()).toBe("legacy");
  });
});

describe("missingProviderConfig", () => {
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
