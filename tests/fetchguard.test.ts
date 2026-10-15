import { describe, expect, it, vi } from "vitest";
import {
  BlockedUrlError,
  FetchStatusError,
  isBlockedIp,
  safeFetchText,
} from "@/lib/fetchguard";

describe("isBlockedIp", () => {
  it("blocks loopback and private v4 ranges", () => {
    expect(isBlockedIp("127.0.0.1")).toBe(true);
    expect(isBlockedIp("10.0.0.5")).toBe(true);
    expect(isBlockedIp("172.16.0.1")).toBe(true);
    expect(isBlockedIp("172.31.255.255")).toBe(true);
    expect(isBlockedIp("192.168.1.1")).toBe(true);
    expect(isBlockedIp("100.64.0.1")).toBe(true);
    expect(isBlockedIp("0.0.0.0")).toBe(true);
  });

  it("blocks the cloud metadata link-local address", () => {
    expect(isBlockedIp("169.254.169.254")).toBe(true);
  });

  it("allows normal public v4 addresses", () => {
    expect(isBlockedIp("1.1.1.1")).toBe(false);
    expect(isBlockedIp("8.8.8.8")).toBe(false);
    expect(isBlockedIp("172.32.0.1")).toBe(false); // just outside private
    expect(isBlockedIp("93.184.216.34")).toBe(false);
  });

  it("blocks loopback, link-local, and unique-local v6", () => {
    expect(isBlockedIp("::1")).toBe(true);
    expect(isBlockedIp("fe80::1")).toBe(true);
    expect(isBlockedIp("fc00::1")).toBe(true);
    expect(isBlockedIp("fd12:3456::1")).toBe(true);
  });

  it("unwraps IPv4-mapped v6 and blocks a private embedded address", () => {
    expect(isBlockedIp("::ffff:127.0.0.1")).toBe(true);
    expect(isBlockedIp("::ffff:192.168.0.1")).toBe(true);
  });

  it("refuses anything that isn't a valid IP", () => {
    expect(isBlockedIp("not-an-ip")).toBe(true);
    expect(isBlockedIp("")).toBe(true);
  });
});

describe("safeFetchText", () => {
  // Waitrose reset the connection on a bare request, so the page headers have
  // to go out with every fetch, not only when a caller remembers them.
  it("sends the headers a browser sends for a page load", async () => {
    const seen: Headers[] = [];
    vi.stubGlobal("fetch", async (_url: URL, init: RequestInit) => {
      seen.push(new Headers(init.headers));
      return new Response("<html></html>", { status: 200 });
    });
    try {
      await safeFetchText("https://93.184.216.34/recipe", { userAgent: "test-agent" });
    } finally {
      vi.unstubAllGlobals();
    }
    expect(seen[0].get("accept")).toContain("text/html");
    expect(seen[0].get("accept-language")).toBe("en-GB,en;q=0.9");
    expect(seen[0].get("user-agent")).toBe("test-agent");
  });

  it("reports a refusal with its status, apart from a blocked link", async () => {
    vi.stubGlobal("fetch", async () => new Response("no", { status: 403 }));
    try {
      const err = await safeFetchText("https://93.184.216.34/recipe").catch((e) => e);
      expect(err).toBeInstanceOf(FetchStatusError);
      expect(err).not.toBeInstanceOf(BlockedUrlError);
      expect(err.status).toBe(403);
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
