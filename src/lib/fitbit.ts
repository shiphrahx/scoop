// The one and only place that talks to Fitbit. Everything else in the app goes
// through these functions, so when Fitbit's legacy Web API is turned down
// (~Sept 2026, migrating to the Google Health API) we swap the endpoints here
// and nothing else changes. Pure API calls — no database, no cookies.

const AUTH_URL = "https://www.fitbit.com/oauth2/authorize";
const TOKEN_URL = "https://api.fitbit.com/oauth2/token";
const API_BASE = "https://api.fitbit.com";
const SCOPE = "activity sleep";

// Every Fitbit call gets a deadline so a stalled request can't hang a server
// action or wedge the nightly cron loop on one slow user.
const REQUEST_TIMEOUT_MS = 8000;

export interface FitbitTokens {
  access_token: string;
  refresh_token: string;
  expires_at: string; // ISO timestamp
  scope: string | null;
  fitbit_user_id: string | null;
}

// One day pulled from Fitbit, in the shape our `activity` table stores.
export interface FitbitDay {
  date: string; // YYYY-MM-DD
  steps: number | null;
  workout_kcal: number | null;
  sleep_hours: number | null;
}

function clientId(): string {
  const id = process.env.FITBIT_CLIENT_ID;
  if (!id) throw new Error("FITBIT_CLIENT_ID is not set.");
  return id;
}

// Basic auth header for the token endpoint (client_id:client_secret, base64).
function basicAuth(): string {
  const id = clientId();
  const secret = process.env.FITBIT_CLIENT_SECRET;
  if (!secret) throw new Error("FITBIT_CLIENT_SECRET is not set.");
  return Buffer.from(`${id}:${secret}`).toString("base64");
}

// Where Fitbit sends the user back. Kept relative to the running site so it
// works in dev and on Vercel without extra config.
export function redirectUri(origin: string): string {
  return `${origin}/api/fitbit/callback`;
}

// The URL we send the user to so they can grant access.
export function authorizeUrl(origin: string, state: string): string {
  const params = new URLSearchParams({
    response_type: "code",
    client_id: clientId(),
    scope: SCOPE,
    redirect_uri: redirectUri(origin),
    state,
  });
  return `${AUTH_URL}?${params.toString()}`;
}

// Shape the raw token response into our stored form.
function toTokens(json: {
  access_token: string;
  refresh_token: string;
  expires_in: number;
  scope?: string;
  user_id?: string;
}): FitbitTokens {
  return {
    access_token: json.access_token,
    refresh_token: json.refresh_token,
    expires_at: new Date(Date.now() + json.expires_in * 1000).toISOString(),
    scope: json.scope ?? null,
    fitbit_user_id: json.user_id ?? null,
  };
}

// Trade the one-time code from the callback for tokens.
export async function exchangeCode(
  code: string,
  origin: string,
): Promise<FitbitTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri(origin),
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Fitbit token exchange failed (${res.status}).`);
  }
  return toTokens(await res.json());
}

// Get a fresh access token from a refresh token.
export async function refreshTokens(
  refreshToken: string,
): Promise<FitbitTokens> {
  const res = await fetch(TOKEN_URL, {
    method: "POST",
    headers: {
      Authorization: `Basic ${basicAuth()}`,
      "Content-Type": "application/x-www-form-urlencoded",
    },
    body: new URLSearchParams({
      grant_type: "refresh_token",
      refresh_token: refreshToken,
    }),
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  });
  if (!res.ok) {
    throw new Error(`Fitbit token refresh failed (${res.status}).`);
  }
  return toTokens(await res.json());
}

async function getJson(
  accessToken: string,
  path: string,
): Promise<Record<string, unknown> | null> {
  const res = await fetch(`${API_BASE}${path}`, {
    headers: { Authorization: `Bearer ${accessToken}` },
    signal: AbortSignal.timeout(REQUEST_TIMEOUT_MS),
  }).catch(() => null);
  if (!res || !res.ok) return null;
  return res.json();
}

// Pull one day's steps, workout calories and sleep. Missing pieces come back
// null so the caller can still store what it did get.
export async function getDay(
  accessToken: string,
  date: string,
): Promise<FitbitDay> {
  const [activity, sleep] = await Promise.all([
    getJson(accessToken, `/1/user/-/activities/date/${date}.json`),
    getJson(accessToken, `/1.2/user/-/sleep/date/${date}.json`),
  ]);

  const summary = (activity?.summary ?? {}) as {
    steps?: number;
    activityCalories?: number;
  };
  const sleepSummary = (sleep?.summary ?? {}) as {
    totalMinutesAsleep?: number;
  };

  return {
    date,
    steps: typeof summary.steps === "number" ? summary.steps : null,
    workout_kcal:
      typeof summary.activityCalories === "number"
        ? summary.activityCalories
        : null,
    sleep_hours:
      typeof sleepSummary.totalMinutesAsleep === "number"
        ? Math.round((sleepSummary.totalMinutesAsleep / 60) * 10) / 10
        : null,
  };
}
