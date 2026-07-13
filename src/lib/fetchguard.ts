import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

// A hardened server-side fetcher for URLs the USER supplies (recipe import).
// Without this, `fetch(userUrl)` is a Server-Side Request Forgery hole: a signed
// -in user could point us at cloud metadata (169.254.169.254), localhost admin
// ports, or other internal services and read the response back. We:
//   - allow only http/https,
//   - resolve the host and refuse private / loopback / link-local IPs,
//   - follow redirects manually, re-checking every hop (a public URL can 302
//     to an internal one),
//   - cap the download size and total time.

const MAX_REDIRECTS = 4;
const DEFAULT_MAX_BYTES = 2_000_000; // 2 MB of HTML is plenty for a recipe.
const DEFAULT_TIMEOUT_MS = 8000;

export class BlockedUrlError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "BlockedUrlError";
  }
}

// Is this a literal IP we must never let the server reach? Covers the ranges an
// SSRF payload reaches for: loopback, private, link-local (incl. cloud metadata
// 169.254.169.254), carrier-grade NAT, and the IPv6 equivalents.
export function isBlockedIp(ip: string): boolean {
  const v = isIP(ip);
  if (v === 4) {
    const p = ip.split(".").map(Number);
    if (p.length !== 4 || p.some((n) => Number.isNaN(n))) return true;
    const [a, b] = p;
    if (a === 0 || a === 10 || a === 127) return true; // this-host, private, loopback
    if (a === 169 && b === 254) return true; // link-local + metadata
    if (a === 172 && b >= 16 && b <= 31) return true; // private
    if (a === 192 && b === 168) return true; // private
    if (a === 100 && b >= 64 && b <= 127) return true; // CGNAT
    if (a >= 224) return true; // multicast + reserved
    return false;
  }
  if (v === 6) {
    const ip6 = ip.toLowerCase();
    if (ip6 === "::1" || ip6 === "::") return true; // loopback / unspecified
    if (ip6.startsWith("fe80")) return true; // link-local
    if (ip6.startsWith("fc") || ip6.startsWith("fd")) return true; // unique-local
    // IPv4-mapped (::ffff:a.b.c.d) — re-check the embedded v4 address.
    const mapped = ip6.match(/::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (mapped) return isBlockedIp(mapped[1]);
    return false;
  }
  return true; // not a valid IP → refuse
}

// Reject a URL whose scheme isn't http(s) or whose host resolves to a blocked
// address. Returns the resolved public URL object.
async function assertPublicUrl(raw: string): Promise<URL> {
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    throw new BlockedUrlError("That doesn't look like a valid URL.");
  }
  if (url.protocol !== "http:" && url.protocol !== "https:") {
    throw new BlockedUrlError("Only http and https links are allowed.");
  }
  // Resolve every A/AAAA record — a host with even one private answer is out.
  const results = await lookup(url.hostname, { all: true }).catch(() => {
    throw new BlockedUrlError("Couldn't resolve that host.");
  });
  if (!results.length || results.some((r) => isBlockedIp(r.address))) {
    throw new BlockedUrlError("That link points to a disallowed address.");
  }
  return url;
}

// Read a response body, aborting once it exceeds maxBytes so a huge or endless
// stream can't exhaust memory.
async function readCapped(res: Response, maxBytes: number): Promise<string> {
  const reader = res.body?.getReader();
  if (!reader) return "";
  const chunks: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    total += value.length;
    if (total > maxBytes) {
      await reader.cancel();
      break;
    }
    chunks.push(value);
  }
  return Buffer.concat(chunks).toString("utf8");
}

export interface SafeFetchOptions {
  maxBytes?: number;
  timeoutMs?: number;
  userAgent?: string;
}

// Fetch the text of a user-supplied URL with SSRF protection, redirect
// re-validation, and size/time caps. Throws BlockedUrlError when the target is
// disallowed.
export async function safeFetchText(
  rawUrl: string,
  opts: SafeFetchOptions = {},
): Promise<string> {
  const maxBytes = opts.maxBytes ?? DEFAULT_MAX_BYTES;
  const headers: Record<string, string> = {};
  if (opts.userAgent) headers["User-Agent"] = opts.userAgent;

  let current = rawUrl;
  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    const url = await assertPublicUrl(current);
    const res = await fetch(url, {
      headers,
      redirect: "manual",
      signal: AbortSignal.timeout(opts.timeoutMs ?? DEFAULT_TIMEOUT_MS),
    });

    // Follow redirects ourselves so each new location is re-checked.
    if (res.status >= 300 && res.status < 400) {
      const location = res.headers.get("location");
      if (!location) throw new BlockedUrlError("Redirect without a location.");
      current = new URL(location, url).toString();
      continue;
    }
    if (!res.ok) throw new BlockedUrlError(`Fetch failed (${res.status}).`);
    return readCapped(res, maxBytes);
  }
  throw new BlockedUrlError("Too many redirects.");
}
