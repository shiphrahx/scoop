import { describe, expect, it } from "vitest";
import {
  localDate,
  localWeekStart,
  safeTimezone,
  startOfLocalDay,
  weekStartOf,
} from "@/lib/time";

// Every one of these is a day the app got wrong when it read "today" off the
// server clock, which on Vercel is always UTC.

describe("localDate", () => {
  it("gives the UK its own date during the small hours of BST", () => {
    // 00:30 on 14 July in London is still 23:30 on the 13th in UTC. The user is
    // looking at Tuesday; the server thought it was Monday, so the home screen
    // showed yesterday's food and a meal logged now landed on the wrong day.
    const at = new Date("2026-07-13T23:30:00Z");
    expect(localDate("Europe/London", at)).toBe("2026-07-14");
    expect(localDate("UTC", at)).toBe("2026-07-13");
  });

  it("gives Auckland tomorrow's date while UTC is still on today", () => {
    const at = new Date("2026-07-13T20:00:00Z"); // 08:00 on the 14th in NZ
    expect(localDate("Pacific/Auckland", at)).toBe("2026-07-14");
  });

  it("keeps Los Angeles on yesterday's date after UTC midnight", () => {
    const at = new Date("2026-07-14T04:00:00Z"); // 21:00 on the 13th in LA
    expect(localDate("America/Los_Angeles", at)).toBe("2026-07-13");
  });
});

describe("startOfLocalDay", () => {
  it("is midnight where the user is, not midnight UTC", () => {
    // Midnight in London during BST is 23:00 UTC the day before. Summing food
    // from UTC midnight would have missed everything eaten in that hour.
    const at = new Date("2026-07-14T10:00:00Z");
    expect(startOfLocalDay("Europe/London", at).toISOString()).toBe(
      "2026-07-13T23:00:00.000Z",
    );
  });

  it("handles a zone behind UTC", () => {
    // Midnight on the 13th in LA (PDT, UTC-7) is 07:00 UTC on the 13th.
    const at = new Date("2026-07-13T20:00:00Z");
    expect(startOfLocalDay("America/Los_Angeles", at).toISOString()).toBe(
      "2026-07-13T07:00:00.000Z",
    );
  });

  it("is plain midnight in UTC", () => {
    const at = new Date("2026-07-13T15:00:00Z");
    expect(startOfLocalDay("UTC", at).toISOString()).toBe("2026-07-13T00:00:00.000Z");
  });

  it("gets the winter offset right too (GMT, not BST)", () => {
    // In January London is on GMT — the same as UTC — so no shift at all.
    const at = new Date("2026-01-14T10:00:00Z");
    expect(startOfLocalDay("Europe/London", at).toISOString()).toBe(
      "2026-01-14T00:00:00.000Z",
    );
  });
});

describe("weekStartOf", () => {
  it("returns the Monday of a mid-week date", () => {
    expect(weekStartOf("2026-07-10")).toBe("2026-07-06"); // a Friday
  });

  it("maps a Sunday back to the Monday it followed, not the one ahead", () => {
    expect(weekStartOf("2026-07-12")).toBe("2026-07-06");
  });

  it("leaves a Monday alone", () => {
    expect(weekStartOf("2026-07-06")).toBe("2026-07-06");
  });
});

describe("localWeekStart", () => {
  it("rolls over to the new week on the user's Monday, not the server's", () => {
    // 23:30 UTC on Sunday 12 July is already 00:30 Monday 13 July in London, so
    // the user's new week (and their new macro target) has started.
    const at = new Date("2026-07-12T23:30:00Z");
    expect(localWeekStart("Europe/London", at)).toBe("2026-07-13");
    expect(localWeekStart("UTC", at)).toBe("2026-07-06");
  });
});

describe("safeTimezone", () => {
  it("keeps a real zone", () => {
    expect(safeTimezone("Europe/London")).toBe("Europe/London");
  });

  it("falls back to UTC on junk rather than throwing on every page load", () => {
    expect(safeTimezone("Mars/Olympus_Mons")).toBe("UTC");
    expect(safeTimezone(null)).toBe("UTC");
    expect(safeTimezone("")).toBe("UTC");
  });
});
