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

export interface KpiIncludes {
  manualOrders?: boolean;
  payments?: boolean;
}

export interface DashboardApi {
  /**
   * `manualOrders`: the agent takes manual orders and the role may read them.
   * `payments`: the role may read payments. Nothing the role may not read is
   * requested -- a 403 per tile was Round 1 G17's "Beranda asks for data the
   * role can't read".
   */
  getKpiSummary(include?: KpiIncludes): Promise<KpiSummary>;
  getMonthlyChart(): Promise<MonthlyChartPoint[]>;
  getOutletShares(): Promise<OutletShare[]>;
  getRecentActivities(): Promise<RecentActivity[]>;
  getDispatchRail(): Promise<DispatchRail>;
  getRecentAudit(limit?: number): Promise<AuditEntry[]>;
}
