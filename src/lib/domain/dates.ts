// All dates are ISO calendar dates (YYYY-MM-DD) handled in UTC, so day
// arithmetic never drifts across time zones or daylight-saving changes.

const DAY_MS = 86_400_000;

function toUtcMs(iso: string): number {
  return Date.UTC(Number(iso.slice(0, 4)), Number(iso.slice(5, 7)) - 1, Number(iso.slice(8, 10)));
}

function fromUtcMs(ms: number): string {
  return new Date(ms).toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  return fromUtcMs(toUtcMs(iso) + days * DAY_MS);
}

/** Whole days from `from` to `to` (negative when `to` is earlier). */
export function daysBetween(from: string, to: string): number {
  return Math.round((toUtcMs(to) - toUtcMs(from)) / DAY_MS);
}

/** The user's local calendar date. */
export function todayIso(now: Date = new Date()): string {
  const m = String(now.getMonth() + 1).padStart(2, "0");
  const d = String(now.getDate()).padStart(2, "0");
  return `${now.getFullYear()}-${m}-${d}`;
}

// When the two dates are equal, either one is the answer.
export function laterOf(a: string, b: string): string {
  return a > b ? a : b;
}

export function earlierOf(a: string, b: string): string {
  return a < b ? a : b;
}
