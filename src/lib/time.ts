// Days, in the user's timezone rather than the server's.
//
// The server runs in UTC (Vercel always does). "Today" was being read off the
// server clock, so a user in the UK between midnight and 1am BST — or anyone in
// Auckland or Los Angeles for a good chunk of every day — was shown the wrong
// day's food and could log a meal onto the wrong date. Every day boundary in the
// app goes through here now, with the timezone the user actually lives in.

export const DEFAULT_TIMEZONE = "UTC";

// A timezone we can actually use. Anything the browser hands us that Intl
// doesn't recognise (or nothing at all) falls back to UTC rather than throwing
// on every page load.
export function safeTimezone(tz: string | null | undefined): string {
  if (!tz) return DEFAULT_TIMEZONE;
  try {
    new Intl.DateTimeFormat("en-CA", { timeZone: tz });
    return tz;
  } catch {
    return DEFAULT_TIMEZONE;
  }
}

// How far `tz` is ahead of UTC at a given instant, in milliseconds. Read from
// Intl rather than a table, so daylight saving is handled for free.
function offsetMs(tz: string, at: Date): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  }).formatToParts(at);

  const get = (type: string) =>
    Number(parts.find((p) => p.type === type)?.value ?? "0");

  const asUtc = Date.UTC(
    get("year"),
    get("month") - 1,
    get("day"),
    get("hour"),
    get("minute"),
    get("second"),
  );
  // Intl gives the wall-clock time in `tz`; the gap to the real instant is the
  // offset. Rounded to the second — `at` carries milliseconds, the parts don't.
  return asUtc - Math.floor(at.getTime() / 1000) * 1000;
}

// The calendar date it is right now where the user lives, as YYYY-MM-DD.
// en-CA formats as YYYY-MM-DD, which is the shape our date columns use.
export function localDate(tz: string, at: Date = new Date()): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: safeTimezone(tz),
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(at);
}

// Midnight of a given calendar date in `zone`, as a UTC Date. Read the date as
// if it were UTC, then shift back by the zone's offset to get the real instant.
// The offset is taken at that midnight, so a DST changeover lands on the right
// side.
function localMidnight(zone: string, dateISO: string): Date {
  const asUtcMidnight = new Date(`${dateISO}T00:00:00Z`);
  return new Date(asUtcMidnight.getTime() - offsetMs(zone, asUtcMidnight));
}

// The instant the user's day began — midnight where they are, as a UTC Date.
// This is what food_logs.logged_at (a timestamptz) has to be compared against
// to sum "today's" food.
export function startOfLocalDay(tz: string, at: Date = new Date()): Date {
  const zone = safeTimezone(tz);
  return localMidnight(zone, localDate(zone, at));
}

// A calendar date `n` days from `dateISO`, as YYYY-MM-DD. Pure string maths in
// UTC — no clock, no zone — so it can't drift with the server's day.
export function addDaysISO(dateISO: string, n: number): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  day.setUTCDate(day.getUTCDate() + n);
  return day.toISOString().slice(0, 10);
}

// The [start, end) UTC instants bounding a calendar date in the user's zone —
// midnight of that date to midnight of the next. Used to sum a specific day's
// food, not just today's.
export function dayRangeFor(tz: string, dateISO: string): { start: Date; end: Date } {
  const zone = safeTimezone(tz);
  return {
    start: localMidnight(zone, dateISO),
    end: localMidnight(zone, addDaysISO(dateISO, 1)),
  };
}

// The Monday (as YYYY-MM-DD) of the week containing a calendar date. Pure string
// maths on a date that is already in the user's zone — no clock involved, so it
// can't drift with the server's.
export function weekStartOf(dateISO: string): string {
  const [y, m, d] = dateISO.split("-").map(Number);
  const day = new Date(Date.UTC(y, m - 1, d));
  const dow = day.getUTCDay(); // 0 = Sunday
  const shift = (dow === 0 ? -6 : 1) - dow; // back to Monday
  day.setUTCDate(day.getUTCDate() + shift);
  return day.toISOString().slice(0, 10);
}

// The Monday of the week the user is currently in.
export function localWeekStart(tz: string, at: Date = new Date()): string {
  return weekStartOf(localDate(tz, at));
}
