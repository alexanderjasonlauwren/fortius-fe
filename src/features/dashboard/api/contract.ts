/**
 * What every dashboard adapter must provide.
 *
 * Split out last, per the plan's own sequencing: every figure here already
 * has a real feature behind it once orders (B2), notifications (B3),
 * reports/deliveries (B5) and transactions (B6) are wired, so this adapter
 * composes those rather than re-deriving a fifth copy of the same numbers.
 */
import type { AuditEntry } from "@/types/domain";
import type {
  DispatchRail,
  KpiSummary,
  MonthlyChartPoint,
  OutletShare,
  RecentActivity,
} from "../types";

/** Every operational figure Beranda draws, from one request (Round 1 G15). */
export interface DashboardSummary {
  kpi: KpiSummary;
  rail: DispatchRail;
  monthlyChart: MonthlyChartPoint[];
  outletShares: OutletShare[];
  recentActivities: RecentActivity[];
}

export interface DashboardApi {
  /**
   * `GET /dashboard/summary`: the server sums the day, the month and the
   * tiles that used to take twenty requests. A figure the role may not read
   * comes back absent -- nothing the role may not read is asked for (G17).
   * No parameter: it is passed bare to useQuery's queryFn.
   */
  getSummary(): Promise<DashboardSummary>;
  getRecentAudit(limit?: number): Promise<AuditEntry[]>;
}
