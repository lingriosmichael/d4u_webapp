// The Belege-Übersicht shows dates in Europe/Berlin, while created_at is a
// UTC timestamp. A date filter must therefore compare against the instant a
// Berlin calendar day starts, not against midnight UTC: a Beleg submitted
// at 00:30 Berlin time on 13 Oct is 22:30 UTC on 12 Oct.

const BERLIN = "Europe/Berlin";

/** Berlin's offset from UTC in minutes at `utcMs` (60 in winter, 120 in summer). */
function berlinOffsetMinutes(utcMs: number): number {
  const parts = new Intl.DateTimeFormat("en-US", {
    timeZone: BERLIN,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  }).formatToParts(new Date(utcMs));
  const part = (type: string) => Number(parts.find((p) => p.type === type)?.value);
  const wallClockAsUtc = Date.UTC(
    part("year"),
    part("month") - 1,
    part("day"),
    part("hour"),
    part("minute"),
  );
  return (wallClockAsUtc - utcMs) / 60_000;
}

/** "YYYY-MM-DD" → the ISO instant that Berlin calendar day starts. The
 * clock change happens at 01:00 UTC, after every Berlin midnight, so the
 * offset at 00:00 UTC of that date is the one in force at its midnight. */
export function startOfBerlinDay(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const midnightUtc = Date.UTC(year, month - 1, day);
  return new Date(midnightUtc - berlinOffsetMinutes(midnightUtc) * 60_000).toISOString();
}

/** "YYYY-MM-DD" → the ISO instant the following Berlin calendar day starts. */
export function startOfNextBerlinDay(ymd: string): string {
  const [year, month, day] = ymd.split("-").map(Number);
  const next = new Date(Date.UTC(year, month - 1, day + 1)).toISOString().slice(0, 10);
  return startOfBerlinDay(next);
}
