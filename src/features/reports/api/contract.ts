/**
 * What every reports adapter must provide.
 *
 * Split out of a single `reportApi.ts` now that a real adapter exists
 * (fortius-backend gained a general `GET /deliveries` list endpoint
 * specifically for this -- see reportApi.http.ts's own header). The range
 * helpers stay here rather than in either adapter: they are pure date
 * arithmetic with no data source of their own, the same reason
 * `financeApi/contract.ts` holds `AGING_BUCKETS`.
 */
import { addDays, isoDate, startOfToday } from "@/lib/date";

export type ReportRange = "hari-ini" | "7h" | "30h" | "bulan-ini" | "bulan-lalu";

export function reportRangeFromParam(value: string | null): ReportRange {
  return value !== null && Object.prototype.hasOwnProperty.call(RANGE_LABEL, value)
    ? value as ReportRange
    : "30h";
}

export const RANGE_LABEL: Record<ReportRange, string> = {
  "hari-ini": "Hari ini",
  "7h": "7 hari terakhir",
  "30h": "30 hari terakhir",
  "bulan-ini": "Bulan berjalan",
  "bulan-lalu": "Bulan lalu",
};

export function resolveRange(range: ReportRange): { from: string; to: string } {
  const today = startOfToday();
  switch (range) {
    case "hari-ini":
      return { from: isoDate(today), to: isoDate(today) };
    case "7h":
      return { from: isoDate(addDays(today, -6)), to: isoDate(today) };
    case "30h":
      return { from: isoDate(addDays(today, -29)), to: isoDate(today) };
    case "bulan-lalu": {
      const first = new Date(today.getFullYear(), today.getMonth() - 1, 1);
      const last = new Date(today.getFullYear(), today.getMonth(), 0);
      return { from: isoDate(first), to: isoDate(last) };
    }
    case "bulan-ini":
    default: {
      const first = new Date(today.getFullYear(), today.getMonth(), 1);
      return { from: isoDate(first), to: isoDate(today) };
    }
  }
}

export interface ReportSummary {
  range: { from: string; to: string };
  unitTerkirim: number;
  unitTarget: number;
  pencapaian: number;
  pendapatan: number;
  /**
   * Revenue for SIM3LON days before a branch's planning start date: sold and
   * paid outside the system, posted to the ledger as Dr Bank / Cr Penjualan.
   * Kept apart from `pendapatan`, which is only what the system verified.
   */
  pendapatanSebelumGoLive: number;
  unitSebelumGoLive: number;
  piutang: number;
  ditolak: number;
  suratJalan: number;
  suratJalanSelesai: number;
  suratJalanTertunda: number;
  outletDilayani: number;
  rerataPerHari: number;
}

export interface DailyPoint {
  tanggal: string;
  target: number;
  realisasi: number;
  pendapatan: number;
  pendapatanSebelumGoLive: number;
}

export interface TopOutletRow {
  id: string;
  nama: string;
  kecamatan: string;
  unit: number;
  suratJalan: number;
  nilai: number;
}

export interface DriverPerformanceRow {
  id: string;
  nama: string;
  plat: string;
  armada: string;
  suratJalan: number;
  selesai: number;
  tertunda: number;
  unit: number;
  ketepatan: number;
}

export interface ReportsApi {
  getReportSummary(range: ReportRange): Promise<ReportSummary>;
  getDailySeries(range: ReportRange): Promise<DailyPoint[]>;
  getTopOutlet(range: ReportRange, limit?: number): Promise<TopOutletRow[]>;
  getDriverPerformance(range: ReportRange): Promise<DriverPerformanceRow[]>;
  exportReport(range: ReportRange): Promise<number>;
  printReport(range: ReportRange): Promise<void>;
}
