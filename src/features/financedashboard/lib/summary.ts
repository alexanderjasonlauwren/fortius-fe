/**
 * The figures Dasbor Keuangan and Beranda's finance strip read off the
 * report pack and the Laba Rugi -- picked out of their totals here, so the
 * screens never re-add rows and can never disagree with the report the
 * figure links to (accounting parity P6).
 */
import type { Report } from "@/features/financereports/api/financereportsApi";
import type { StatementLine } from "@/features/financialstatements/api/financialstatementsApi";

/** A cell of the report's grand-total row, 0 when the report has none. */
export function reportTotal(report: Report | undefined, column: string): number {
  const total = report?.rows.find((r) => r.kind === "total");
  const v = total?.cells[column];
  return typeof v === "number" ? v : 0;
}

export interface AgingSplit {
  total: number;
  /** Not yet due on the report date. */
  current: number;
  /** Past due on the report date: every bucket but "current". */
  overdue: number;
  buckets: { key: string; label: string; amount: number }[];
}

const AGING_BUCKETS = [
  { key: "current", label: "Belum jatuh tempo" },
  { key: "d1_30", label: "1–30 hari" },
  { key: "d31_60", label: "31–60 hari" },
  { key: "d61_90", label: "61–90 hari" },
  { key: "d90", label: "> 90 hari" },
];

export function agingSplit(report: Report | undefined): AgingSplit {
  const total = reportTotal(report, "total");
  const current = reportTotal(report, "current");
  return {
    total,
    current,
    overdue: total - current,
    buckets: AGING_BUCKETS.map((b) => ({ ...b, amount: reportTotal(report, b.key) })),
  };
}

/** One Laba Rugi line by its layout code; null when the layout has no such
 *  line (a tenant still on the 2025 format has no EBITDA). */
export function plLine(lines: StatementLine[] | undefined, code: string): number | null {
  const line = lines?.find((l) => l.code === code);
  return line ? line.amount : null;
}

/** The figures a summary shows, by laba_rugi_v2 line code. Costs come back
 *  negative from the layout (it adds every line); shown as positive costs. */
export interface ProfitSummary {
  pendapatan: number | null;
  hpp: number | null;
  labaKotor: number | null;
  biayaOperasional: number | null;
  ebitda: number | null;
  labaBersih: number | null;
}

export function profitSummary(lines: StatementLine[] | undefined): ProfitSummary {
  const cost = (v: number | null) => (v === null ? null : Math.abs(v));
  return {
    pendapatan: plLine(lines, "total_pendapatan"),
    hpp: cost(plLine(lines, "hpp")),
    labaKotor: plLine(lines, "laba_kotor"),
    biayaOperasional: cost(plLine(lines, "total_biaya_operasional")),
    ebitda: plLine(lines, "ebitda"),
    labaBersih: plLine(lines, "laba_bersih"),
  };
}

const MONTH_SHORT = ["Jan", "Feb", "Mar", "Apr", "Mei", "Jun", "Jul", "Agu", "Sep", "Okt", "Nov", "Des"];

function iso(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export interface MonthWindow {
  from: string;
  to: string;
  label: string;
}

/** The last `n` calendar months ending with today's, oldest first; the
 *  current month runs to today. */
export function monthWindows(today: string, n: number): MonthWindow[] {
  const [y, m] = today.split("-").map(Number);
  const out: MonthWindow[] = [];
  for (let i = n - 1; i >= 0; i--) {
    const first = new Date(Date.UTC(y, m - 1 - i, 1));
    const last = new Date(Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0));
    const to = i === 0 ? today : iso(last);
    out.push({
      from: iso(first),
      to,
      label: `${MONTH_SHORT[first.getUTCMonth()]} ${String(first.getUTCFullYear()).slice(2)}`,
    });
  }
  return out;
}

export function addDaysIso(day: string, days: number): string {
  const [y, m, d] = day.split("-").map(Number);
  return iso(new Date(Date.UTC(y, m - 1, d + days)));
}
