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

export interface DashboardApi {
  getKpiSummary(includeManualOrders?: boolean): Promise<KpiSummary>;
  getMonthlyChart(): Promise<MonthlyChartPoint[]>;
  getOutletShares(): Promise<OutletShare[]>;
  getRecentActivities(): Promise<RecentActivity[]>;
  getDispatchRail(): Promise<DispatchRail>;
  getRecentAudit(limit?: number): Promise<AuditEntry[]>;
}
