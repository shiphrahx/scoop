// Google Health API (the Fitbit Web API successor). Same job as lib/fitbit.ts —
// OAuth plus one day's steps / active calories / sleep — but against Google's
// v4 endpoints and Google OAuth. lib/fitbit.ts dispatches here when
// HEALTH_PROVIDER=google, so the callback route, the cron, and the stored token
// shape are all unchanged; only the wire calls differ.
//
// Endpoints, scopes and the daily-rollup request/response shapes below come from
// Google's v4 discovery doc (health.googleapis.com/$discovery/rest?version=v4).
// The value nesting is parsed defensively so a shape surprise degrades to null
// rather than throwing.

import type { FitbitDay, FitbitTokens } from "@/lib/fitbit";

// Google OAuth (not fitbit.com any more).
const AUTH_URL = "https://accounts.google.com/o/oauth2/v2/auth";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const API_BASE = "https://health.googleapis.com/v4/users/me";

// Read-only scopes: one covers steps + active energy, the other sleep.
const SCOPES = [
  "https://www.googleapis.com/auth/googlehealth.activity_and_fitness.readonly",
  "https://www.googleapis.com/auth/googlehealth.sleep.readonly",
].join(" ");

const REQUEST_TIMEOUT_MS = 8000;

function clientId(): string {
  const id = process.env.GOOGLE_HEALTH_CLIENT_ID;
  if (!id) throw new Error("GOOGLE_HEALTH_CLIENT_ID is not set.");
  return id;
}

function clientSecret(): string {
  const secret = process.env.GOOGLE_HEALTH_CLIENT_SECRET;
  if (!secret) throw new Error("GOOGLE_HEALTH_CLIENT_SECRET is not set.");
  return secret;
}

// Same callback the legacy flow used, so the registered redirect URI and the
// route at /api/fitbit/callback don't change.
export function redirectUri(origin: string): string {
  return `${origin}/api/fitbit/callback`;
}

// The consent URL. access_type=offline + prompt=consent are what make Google
// hand back a refresh token (without them there's no offline sync).
export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    redirect_uri: redirectUri(origin),
    scope: SCOPES,
    state,
    access_type: "offline",
    prompt: "consent",
    include_granted_scopes: "true",
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Shape a Google token response into our stored form. Google issues no user_id
// on the token endpoint (identity is a separate call we don't need), so
// fitbit_user_id is null. On REFRESH Google usually omits refresh_token and
// expects the caller to keep the existing one — hence the fallback.
function toTokens(
  json: {
    access_token: string;
    refresh_token?: string;
    expires_in: number;
    scope?: string;
  },
  fallbackRefresh?: string,
): FitbitTokens {
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token ?? fallbackRefresh ?? "",
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    scope: json.scope ?? null,
    fitbit_user_id: null,
  };
}

// Trade the one-time code from the callback for tokens. Google takes the client
// credentials in the body, not a Basic header.
export async function exchangeCode(
  code: string,
  origin: string,
): Promise<FitbitTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(origin),
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Google token exchange failed (${res.status}).`);
  }
  return toTokens(await res.json());
}

// Get a fresh access token. Google returns a new access_token but keeps the same
// refresh_token, so we carry the old one forward.
export async function refreshTokens(
  refreshToken: string,
): Promise<FitbitTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
      client_id: clientId(),
      client_secret: clientSecret(),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Google token refresh failed (${res.status}).`);
  }
  return toTokens(await res.json(), refreshToken);
}

// A CivilDateTime: a nested google.type.Date under `date`. The optional `time`
// (TimeOfDay) is omitted — it defaults to midnight, exactly the day boundary we
// want. NOT flat year/month/day fields; those are rejected.
function civil(y: number, m: number, d: number) {
  return { date: { year: y, month: m, day: d } };
}

// The day-long civil interval [date 00:00, next-day 00:00). A CivilTimeInterval
// is { start, end }, each a CivilDateTime — no offset field (civil = local wall
// time, no zone). Grouped in UTC: getDay has no timezone, and the cron already
// works in UTC days. Threading the user's zone through would sharpen the day
// boundary but isn't needed for a daily total.
function dayRange(date: string) {
  const [y, m, d] = date.split("-").map(Number);
  const next = new Date(Date.UTC(y, m - 1, d + 1));
  return {
    start: civil(y, m, d),
    end: civil(next.getUTCFullYear(), next.getUTCMonth() + 1, next.getUTCDate()),
  };
}

// POST a daily-rollup query for one data type; null on any failure so a missing
// piece doesn't sink the others.
async function rollup(
  accessToken: string,
  dataType: string,
  date: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_BASE}/dataTypes/${dataType}/dataPoints:dailyRollUp`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ range: dayRange(date), windowSizeDays: 1 }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json();
}

// The first rollup point's typed value, or undefined. One day + windowSizeDays 1
// yields at most one point.
function firstValue(json: Record<string, unknown> | null): Record<string, unknown> | undefined {
  const points = (json?.rollupDataPoints ?? []) as Array<{ value?: Record<string, unknown> }>;
  return points[0]?.value;
}

// A finite number from a field that may arrive as a string (int64) or be absent.
function num(v: unknown): number | null {
  const n = typeof v === "string" ? Number(v) : typeof v === "number" ? v : NaN;
  return Number.isFinite(n) ? n : null;
}

// Raw, UNPARSED rollup responses for one day — status + body for each data
// type, exactly as Google returns them. Used by the debug route so the real
// response shape can be confirmed against the (previously unverified) nesting
// getDay assumes. Never called on the hot path.
export async function probeDay(
  accessToken: string,
  date: string,
): Promise<Record<string, { status: number; ok: boolean; body: unknown }>> {
  const types = ["steps", "active-energy-burned", "sleep"];
  const out: Record<string, { status: number; ok: boolean; body: unknown }> = {};
  for (const t of types) {
    const res = await fetch(`${API_BASE}/dataTypes/${t}/dataPoints:dailyRollUp`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ range: dayRange(date), windowSizeDays: 1 }),
      signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
    }).catch(() => null);
    let body: unknown = null;
    if (res) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    }
    out[t] = { status: res?.status ?? 0, ok: res?.ok ?? false, body };
  }
  return out;
}

// Pull one day's steps, active calories and sleep. Mirrors lib/fitbit getDay:
// missing pieces come back null so the caller stores what it did get. Value
// paths follow the v4 discovery doc; parsed defensively.
export async function getDay(accessToken: string, date: string): Promise<FitbitDay> {
  const [stepsJson, energyJson, sleepJson] = await Promise.all([
    rollup(accessToken, "steps", date),
    rollup(accessToken, "active-energy-burned", date),
    rollup(accessToken, "sleep", date),
  ]);

  const steps = firstValue(stepsJson) as { steps?: { count?: unknown } } | undefined;
  const energy = firstValue(energyJson) as
    | { activeEnergyBurned?: { energy?: { kcal?: unknown } } }
    | undefined;
  const sleep = firstValue(sleepJson) as
    | { sleep?: { sleepSummary?: { minutesAsleep?: unknown } } }
    | undefined;

  const minutesAsleep = num(sleep?.sleep?.sleepSummary?.minutesAsleep);

  return {
    date,
    steps: num(steps?.steps?.count),
    workout_kcal: num(energy?.activeEnergyBurned?.energy?.kcal),
    sleep_hours: minutesAsleep != null ? Math.round((minutesAsleep / 60) * 10) / 10 : null,
  };
}
