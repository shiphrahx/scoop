import { NextResponse, type NextRequest } from "next/server";
import { createAdminClient } from "@/lib/supabase/admin";
import { hashToken } from "@/lib/crypto";

// POST /api/ingest/apple — the "Health Auto Export" iOS app posts Apple Watch
// health data here on a schedule. There's no Supabase session, so it proves who
// it is with a per-user token (query ?token= or Authorization: Bearer). We
// resolve the user with the service-role client and upsert into `activity`.
//
// Health Auto Export "Health Metrics" JSON looks like:
//   { "data": { "metrics": [ { "name": "step_count", "units": "count",
//       "data": [ { "date": "2026-07-05 00:00:00 +0000", "qty": 8123 } ] } ] } }

interface Metric {
  name: string;
  data?: Array<Record<string, unknown>>;
}

// A date can arrive as "2026-07-05 00:00:00 +0000" — keep the day part only.
function dayOf(raw: unknown): string | null {
  if (typeof raw !== "string") return null;
  const match = raw.match(/^\d{4}-\d{2}-\d{2}/);
  return match ? match[0] : null;
}

function num(v: unknown): number | null {
  return typeof v === "number" && Number.isFinite(v) ? v : null;
}

export async function POST(request: NextRequest) {
  // Prefer the Authorization header — a token in the query string leaks into
  // access logs, proxies and Referer headers. The ?token= form stays supported
  // for Health Auto Export configs that can't set a header.
  const token =
    request.headers.get("authorization")?.replace(/^Bearer\s+/i, "") ??
    request.nextUrl.searchParams.get("token") ??
    null;
  if (!token) {
    return NextResponse.json({ error: "missing_token" }, { status: 401 });
  }

  let payload: { data?: { metrics?: Metric[] } };
  try {
    payload = await request.json();
  } catch {
    return NextResponse.json({ error: "bad_json" }, { status: 400 });
  }

  const supabase = createAdminClient();

  const { data: userRow } = await supabase
    .from("users")
    .select("id")
    .eq("apple_ingest_token_hash", hashToken(token))
    .maybeSingle();
  const userId = (userRow as { id: string } | null)?.id;
  if (!userId) {
    return NextResponse.json({ error: "bad_token" }, { status: 403 });
  }

  // Fold every metric's points into one row per day.
  const byDay = new Map<
    string,
    { steps: number | null; workout_kcal: number | null; sleep_hours: number | null }
  >();
  const row = (date: string) => {
    let r = byDay.get(date);
    if (!r) {
      r = { steps: null, workout_kcal: null, sleep_hours: null };
      byDay.set(date, r);
    }
    return r;
  };

  for (const metric of payload.data?.metrics ?? []) {
    for (const point of metric.data ?? []) {
      const date = dayOf(point.date);
      if (!date) continue;
      const r = row(date);

      if (metric.name === "step_count") {
        r.steps = num(point.qty);
      } else if (metric.name === "active_energy") {
        r.workout_kcal = num(point.qty);
      } else if (metric.name === "sleep_analysis") {
        // Health Auto Export reports asleep time in hours under "asleep"
        // (older exports) or "totalSleep"; fall back to qty.
        const hours =
          num(point.asleep) ?? num(point.totalSleep) ?? num(point.qty);
        if (hours != null) r.sleep_hours = Math.round(hours * 10) / 10;
      }
    }
  }

  if (byDay.size === 0) {
    return NextResponse.json({ ok: true, days: 0 });
  }

  const rows = [...byDay.entries()].map(([date, r]) => ({
    user_id: userId,
    date,
    steps: r.steps,
    workout_kcal: r.workout_kcal,
    sleep_hours: r.sleep_hours,
    source: "apple",
    updated_at: new Date().toISOString(),
  }));

  const { error } = await supabase
    .from("activity")
    .upsert(rows, { onConflict: "user_id,date" });
  if (error) {
    return NextResponse.json({ error: "write_failed" }, { status: 500 });
  }

  return NextResponse.json({ ok: true, days: rows.length });
}
