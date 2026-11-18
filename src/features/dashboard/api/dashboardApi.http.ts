/**
 * The dashboard, against the real API.
 *
 * # One request (Round 1 G15)
 *
 * Beranda used to compose its tiles from every page of a month's surat
 * jalan, every pangkalan, vehicle, pending receipt and open order, summing
 * them here -- twenty requests before the first tile drew. `GET
 * /dashboard/summary` sums them on the server, on the tenant's day, and
 * leaves out what the role may not read (G17). This file only shapes it.
 *
 * # The dispatch rail's own gap
 *
 * No field for a stop's planned time of day exists anywhere in the schema
 * (`monitoringApi.http.ts`'s own `jamRencana` already reads empty for the
 * same reason). The rail positions stops by their real dispatch order rather
 * than a fabricated clock time, and sets `hasSchedule: false` so
 * `DispatchRail.tsx` stops drawing an hour ruler, a "now" line and a late
 * verdict over a position that was never a real time.
 *
 * # Jejak aktivitas
 *
 * `getRecentAudit` reads `GET /audit-trails/recent` (since 2026-11-02): the
 * acting tenant's latest successful writes, phrased by `activityLabel`. Roles
 * without `audit.read.audit_trails` are not asked and get an empty list.
 */
import { getOne } from "@/lib/api";
import { getActiveScope } from "@/lib/scope";
import { holds } from "@/features/rbac/holds";
import { PERMISSIONS } from "@/features/rbac/permissions";
import type { AuditEntry } from "@/types/domain";
import { activityLabel } from "../lib/activityLabel";
import type {
  DispatchLane,
  DispatchRail,
  DispatchStop,
  KpiSummary,
  MonthlyChartPoint,
  OutletShare,
  RecentActivity,
} from "../types";
import type { DashboardApi, DashboardSummary } from "./contract";

/** Mirrors the backend's dashboard.Summary. */
export interface SummaryResponse {
  date: string;
  daily_target_qty: number;
  days: { date: string; dispatched_qty: number; delivered_qty: number; failed_stops: number }[];
  districts: { district: string; delivered_qty: number }[];
  stops: StopResponse[];
  outlets: { active: number; total: number } | null;
  quota: { allocation_qty: number; remaining_qty: number } | null;
  pending_payments: { count: number; amount: number } | null;
  open_orders: number | null;
}

interface StopResponse {
  id: string;
  delivery_number: string;
  outlet_name?: string | null;
  district?: string | null;
  driver_id?: string | null;
  driver_name?: string | null;
  plate?: string | null;
  vehicle_label?: string | null;
  capacity_qty?: number | null;
  dispatched_qty: number;
  delivered_qty: number;
  delivery_status: string;
  created_at: string;
}

/** Mirrors reportApi.http.ts's own toDeliveryStatus/DeliveryStatus mapping. */
function toDeliveryStatus(status: string): "Antrian" | "Proses" | "Selesai" | "Tertunda" {
  switch (status) {
    case "delivered":
    case "partial":
      return "Selesai";
    case "on_route":
      return "Proses";
    case "failed":
      return "Tertunda";
    default:
      return "Antrian";
  }
}

/** The day before an ISO date, as an ISO date. */
function dayBefore(iso: string): string {
  const d = new Date(`${iso}T00:00:00Z`);
  d.setUTCDate(d.getUTCDate() - 1);
  return d.toISOString().slice(0, 10);
}

function toKpi(row: SummaryResponse): KpiSummary {
  const today = row.days.find((d) => d.date === row.date);
  const yesterday = row.days.find((d) => d.date === dayBefore(row.date));
  const dispatchedToday = today?.dispatched_qty ?? 0;
  return {
    dailyDistributed: today?.delivered_qty ?? 0,
    // What went out today is the target once a run has left; before that, the
    // tenant's own Target harian (inherited from its group when unset).
    dailyTarget: dispatchedToday > 0 ? dispatchedToday : row.daily_target_qty,
    // The same figures as the SA page's Kuota cabang card.
    monthlyQuotaTotal: row.quota?.allocation_qty ?? 0,
    monthlyQuotaRemaining: row.quota?.remaining_qty ?? 0,
    activeOutlet: row.outlets?.active ?? 0,
    totalOutlet: row.outlets?.total ?? 0,
    pendingPayments: row.pending_payments ? row.pending_payments.count : null,
    pendingPaymentValue: row.pending_payments ? row.pending_payments.amount : null,
    previousDayDistributed: yesterday?.delivered_qty ?? 0,
    openOrders: row.open_orders ?? 0,
    lateDeliveries: today?.failed_stops ?? 0,
  };
}

/** This month's days, in 7-day weeks from the 1st. */
function toMonthlyChart(row: SummaryResponse): MonthlyChartPoint[] {
  const [year, month] = row.date.split("-").map(Number);
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const buckets = Array.from({ length: Math.ceil(lastDay / 7) }, (_, i) => ({
    week: `Minggu ${i + 1}`,
    target: 0,
    realisasi: 0,
  }));
  const monthPrefix = row.date.slice(0, 7);
  for (const day of row.days) {
    if (!day.date.startsWith(monthPrefix)) continue; // yesterday, on the 1st
    const dayOfMonth = Number(day.date.slice(8, 10));
    const bucket = buckets[Math.min(buckets.length - 1, Math.floor((dayOfMonth - 1) / 7))];
    bucket.target += day.dispatched_qty;
    bucket.realisasi += day.delivered_qty;
  }
  return buckets;
}

const OUTLET_SHARE_LIMIT = 4;

/** The four largest kecamatan this month, the rest as "Wilayah lain". */
function toOutletShares(row: SummaryResponse): OutletShare[] {
  const sorted = [...row.districts].sort((a, b) => b.delivered_qty - a.delivered_qty);
  const top: [string, number][] = sorted
    .slice(0, OUTLET_SHARE_LIMIT)
    .map((d) => [d.district, d.delivered_qty]);
  const restValue = sorted.slice(OUTLET_SHARE_LIMIT).reduce((s, d) => s + d.delivered_qty, 0);
  if (restValue > 0) top.push(["Wilayah lain", restValue]);

  const grand = top.reduce((s, [, v]) => s + v, 0) || 1;
  return top.map(([name, value]) => ({
    name,
    value,
    percentage: Math.round((value / grand) * 100),
  }));
}

const ACTIVITY_LIMIT = 8;

function toRecentActivities(row: SummaryResponse): RecentActivity[] {
  const stageLabel: Record<string, RecentActivity["status"]> = {
    Selesai: "Selesai",
    Proses: "Dalam Pengiriman",
    Antrian: "Pending",
    Tertunda: "Pending",
  };
  return [...row.stops]
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, ACTIVITY_LIMIT)
    .map((stop) => ({
      id: stop.id,
      tanggal: new Date(stop.created_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      }),
      outlet: stop.outlet_name ?? "—",
      driver: stop.driver_name ?? "—",
      jumlahUnit: stop.delivered_qty || stop.dispatched_qty,
      status: stageLabel[toDeliveryStatus(stop.delivery_status)] ?? "Pending",
    }));
}

function toRail(row: SummaryResponse): DispatchRail {
  const byDriver = new Map<string, DispatchLane>();
  for (const stop of row.stops) {
    if (!stop.driver_id) continue;
    const lane =
      byDriver.get(stop.driver_id) ??
      ({
        driverId: stop.driver_id,
        driver: stop.driver_name ?? "—",
        plat: stop.plate ?? "—",
        // The truck's label and capacity only come for a role that may read
        // the fleet; finance follows the day's runs without them (G17).
        armada: stop.vehicle_label ?? "—",
        kapasitas: stop.capacity_qty ?? 0,
        muatan: 0,
        status: "Standby",
        stops: [],
      } satisfies DispatchLane);
    lane.muatan += stop.dispatched_qty;
    // No planned time exists -- position by real dispatch order instead of a
    // fabricated clock: one slot per stop, in the order the server returned.
    const slot = lane.stops.length;
    lane.stops.push({
      id: stop.id,
      kode: stop.delivery_number,
      outlet: stop.outlet_name ?? "—",
      kecamatan: stop.district || "—",
      startMinute: slot * 60,
      endMinute: slot * 60 + 45,
      target: stop.dispatched_qty,
      realisasi: stop.delivered_qty,
      stage: toDeliveryStatus(stop.delivery_status),
    } satisfies DispatchStop);
    byDriver.set(stop.driver_id, lane);
  }

  const lanes = [...byDriver.values()];
  return {
    dayStart: 0,
    dayEnd: Math.max(60, ...lanes.map((l) => l.stops.length * 60)),
    nowMinute: 0,
    lanes,
    // A driver with no delivery today has no lane rather than an "idle" truck
    // pairing that isn't real -- see driverApi's own contract.
    idleDrivers: [],
    hasSchedule: false,
  };
}

/** Shapes the server's summary into every tile; pure, so it is tested alone. */
export function toDashboardSummary(row: SummaryResponse): DashboardSummary {
  return {
    kpi: toKpi(row),
    rail: toRail(row),
    monthlyChart: toMonthlyChart(row),
    outletShares: toOutletShares(row),
    recentActivities: toRecentActivities(row),
  };
}

async function getSummary(): Promise<DashboardSummary> {
  // The quota follows the scope bar's branch; with none picked the server
  // reads the default branch, as the SA page's Kuota cabang card does.
  const branchId = getActiveScope().branchId;
  const path = branchId
    ? `/dashboard/summary?${new URLSearchParams({ branch_id: branchId }).toString()}`
    : "/dashboard/summary";
  return toDashboardSummary(await getOne<SummaryResponse>(path));
}

/** Mirrors the backend's audittrail.RecentEvent. */
interface RecentEventResponse {
  occurred_at: string;
  actor: string;
  module: string;
  action: string;
  entity: string;
  entity_id?: string;
}

async function getRecentAudit(limit = 6): Promise<AuditEntry[]> {
  if (!holds(PERMISSIONS.AUDIT_VIEW)) return [];
  const rows = await getOne<RecentEventResponse[]>(`/audit-trails/recent?limit=${limit}`);
  return (rows ?? []).map((row, i) => ({
    id: `${row.occurred_at}-${i}`,
    at: row.occurred_at,
    actor: row.actor,
    action: row.action,
    entity: row.entity,
    entityId: row.entity_id ?? "",
    summary: activityLabel(row.module, row.entity, row.action),
  }));
}

export const dashboardApiHttp: DashboardApi = {
  getSummary,
  getRecentAudit,
};
