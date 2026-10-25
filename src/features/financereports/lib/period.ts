/**
 * A report's period, as Jurnal offers it: a day, a week, a month, a year or
 * a custom range -- or, for an as-of report, one date. Kept in the URL so a
 * drill-down to an invoice and back lands on the same report.
 *
 * Date arithmetic is done in UTC on YYYY-MM-DD strings: the server reads a
 * date as a date, and a local-time Date near midnight would shift a week or
 * a month boundary by a day.
 */

export type PeriodPreset = "harian" | "mingguan" | "bulanan" | "tahunan" | "custom";

export const PRESET_LABEL: Record<PeriodPreset, string> = {
  harian: "Harian",
  mingguan: "Mingguan",
  bulanan: "Bulanan",
  tahunan: "Tahunan",
  custom: "Kustom",
};

export interface PeriodState {
  preset: PeriodPreset;
  /** The day for harian, any day of the week for mingguan, the as-of date. */
  date: string;
  year: number;
  /** 1-12. */
  month: number;
  from: string;
  to: string;
}

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function parse(value: string): Date {
  const [y, m, d] = value.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

function isDate(value: string | null): value is string {
  return !!value && /^\d{4}-\d{2}-\d{2}$/.test(value) && !Number.isNaN(parse(value).getTime());
}

/** Today as YYYY-MM-DD in the browser's own calendar. */
export function todayIso(now = new Date()): string {
  return iso(new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate())));
}

export function periodFromParams(params: URLSearchParams, today = todayIso()): PeriodState {
  const t = parse(today);
  const preset = params.get("p");
  const year = Number(params.get("y"));
  const month = Number(params.get("m"));
  const firstOfMonth = iso(new Date(Date.UTC(t.getUTCFullYear(), t.getUTCMonth(), 1)));
  return {
    preset: preset && preset in PRESET_LABEL ? (preset as PeriodPreset) : "bulanan",
    date: isDate(params.get("d")) ? params.get("d")! : today,
    year: Number.isInteger(year) && year >= 2000 && year <= 2100 ? year : t.getUTCFullYear(),
    month: Number.isInteger(month) && month >= 1 && month <= 12 ? month : t.getUTCMonth() + 1,
    from: isDate(params.get("from")) ? params.get("from")! : firstOfMonth,
    to: isDate(params.get("to")) ? params.get("to")! : today,
  };
}

export function periodToParams(state: PeriodState, into = new URLSearchParams()): URLSearchParams {
  into.set("p", state.preset);
  into.set("d", state.date);
  into.set("y", String(state.year));
  into.set("m", String(state.month));
  into.set("from", state.from);
  into.set("to", state.to);
  return into;
}

/** The from/to window a range report is asked for. */
export function resolveRange(state: PeriodState): { from: string; to: string } {
  switch (state.preset) {
    case "harian":
      return { from: state.date, to: state.date };
    case "mingguan": {
      // Monday to Sunday, the week the chosen day falls in.
      const d = parse(state.date);
      const sinceMonday = (d.getUTCDay() + 6) % 7;
      const monday = new Date(d.getTime() - sinceMonday * 86_400_000);
      return { from: iso(monday), to: iso(new Date(monday.getTime() + 6 * 86_400_000)) };
    }
    case "tahunan":
      return { from: `${state.year}-01-01`, to: `${state.year}-12-31` };
    case "custom":
      return state.to < state.from ? { from: state.from, to: state.from } : { from: state.from, to: state.to };
    case "bulanan":
    default: {
      const last = new Date(Date.UTC(state.year, state.month, 0));
      return { from: iso(new Date(Date.UTC(state.year, state.month - 1, 1))), to: iso(last) };
    }
  }
}

/* ── remembered period ─────────────────────────────────────────────────── */

type PeriodStorage = Pick<Storage, "getItem" | "setItem">;

function browserStorage(): PeriodStorage | undefined {
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

const PERIOD_KEYS = ["p", "d", "y", "m", "from", "to"];

function storageKey(report: string): string {
  return `sidistrib.report-period.${report}`;
}

/**
 * The period a report opens on: the URL's when it names one (a shared or
 * bookmarked link wins), otherwise the last one this browser used for this
 * report, so reopening Umur Piutang shows the month you were looking at.
 */
export function recallPeriod(report: string, params: URLSearchParams, storage = browserStorage()): URLSearchParams {
  if (PERIOD_KEYS.some((k) => params.has(k))) return params;
  try {
    const saved = storage?.getItem(storageKey(report));
    if (!saved) return params;
    const merged = new URLSearchParams(params);
    new URLSearchParams(saved).forEach((v, k) => {
      if (PERIOD_KEYS.includes(k)) merged.set(k, v);
    });
    return merged;
  } catch {
    return params;
  }
}

export function rememberPeriod(report: string, state: PeriodState, storage = browserStorage()): void {
  try {
    storage?.setItem(storageKey(report), periodToParams(state).toString());
  } catch {
    // Private mode or a full quota: the report still works, it just won't
    // remember.
  }
}
