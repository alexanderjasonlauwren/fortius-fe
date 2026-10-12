export function startOfToday(): Date {
  const d = new Date();
  d.setHours(0, 0, 0, 0);
  return d;
}

export function addDays(date: Date, days: number): Date {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

/** Local calendar date as "YYYY-MM-DD" — not `toISOString()`, which is UTC and shifts a day for WIB before 07:00. */
export function isoDate(date: Date): string {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

export function todayIso(): string {
  return isoDate(startOfToday());
}

/**
 * A calendar date for a backend field declared as Go `time.Time`, which only
 * unmarshals RFC 3339 — a bare "YYYY-MM-DD" is refused as "Request body is not
 * valid JSON". Fields declared as validated strings take the bare date instead.
 */
export function toApiTimestamp(date: string): string {
  return `${date}T00:00:00Z`;
}
