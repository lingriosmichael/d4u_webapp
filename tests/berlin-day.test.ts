import { describe, expect, it } from "vitest";
import { startOfBerlinDay, startOfNextBerlinDay } from "@/lib/berlin-day";

// The Belege-Übersicht date filter compares created_at (UTC) against the
// instant a Berlin calendar day starts. Pinned around the clock changes,
// where an off-by-one-hour mistake would hide (2026: summer time starts
// 29 Mar, ends 25 Oct, both at 01:00 UTC).

describe("startOfBerlinDay", () => {
  it.each([
    ["2026-12-01", "2026-11-30T23:00:00.000Z", "winter (UTC+1)"],
    ["2026-07-01", "2026-06-30T22:00:00.000Z", "summer (UTC+2)"],
    ["2026-03-29", "2026-03-28T23:00:00.000Z", "summer time starts later that night"],
    ["2026-03-30", "2026-03-29T22:00:00.000Z", "first full summer day"],
    ["2026-10-25", "2026-10-24T22:00:00.000Z", "summer time ends later that night"],
    ["2026-10-26", "2026-10-25T23:00:00.000Z", "first full winter day"],
  ])("%s starts at %s (%s)", (ymd, expected) => {
    expect(startOfBerlinDay(ymd)).toBe(expected);
  });
});

describe("startOfNextBerlinDay", () => {
  it("is the start of the following day, across a month and a year", () => {
    expect(startOfNextBerlinDay("2026-10-31")).toBe("2026-10-31T23:00:00.000Z");
    expect(startOfNextBerlinDay("2026-12-31")).toBe("2026-12-31T23:00:00.000Z");
  });

  it("spans the 25-hour day when summer time ends", () => {
    const start = Date.parse(startOfBerlinDay("2026-10-25"));
    const end = Date.parse(startOfNextBerlinDay("2026-10-25"));
    expect((end - start) / 3_600_000).toBe(25);
  });
});
