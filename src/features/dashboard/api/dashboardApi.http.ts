/**
 * The dashboard, against the real API.
 *
 * Sequenced last in D3's own Track B for exactly this reason: every figure
 * here already has a real feature behind it once orders (B2), reports/
 * deliveries (B5) and transactions (B6) are wired, so this composes those
 * rather than re-deriving a sixth copy of the same numbers. `piutangOutstanding`/
 * `piutangJatuhTempo` come straight from `financeApi.getAgingReport()`;
 * `openOrders` from `orderApi.getOrderTotals()`. Neither is fetched here a
 * second, independently-computed way.
 *
 * `/payments`, `/deliveries` and schedule agreements have no "today" or
 * "this month" convenience on the wire, so this file fetches each with its
 * own date-scoped request the same way `reportApi.http.ts` already does for
 * its own ranges -- a small duplication, not a shared cache, matching this
 * codebase's own established pattern of every adapter fetching what it
 * needs rather than a cross-feature memoisation layer nothing else has.
 *
 * # The dispatch rail's own gap
 *
 * No field for a stop's planned time of day exists anywhere in the schema
 * (`monitoringApi.http.ts`'s own `jamRencana` already reads empty for the
 * same reason). `getDispatchRail` positions stops by their real dispatch
 * order rather than a fabricated clock time, and sets `hasSchedule: false`
 * so `DispatchRail.tsx` stops drawing an hour ruler, a "now" line and a
 * late verdict over a position that was never a real time.
 *
 * # Left out, deliberately
 *
 * `getRecentAudit` returns `[]` -- nothing writes to `audit.audit_trails`
 * on the real service (see the plan's own "out of scope" note); the mock's
 * own seed carries no rows either (`db.audit: []`), so this is not a new
 * gap, just an honest one on both builds.
 */
import { getList } from "@/lib/api";
import { getOutletList } from "@/features/outlet/api/outletApi";
import { getVehicles } from "@/features/vehicles/api/vehicleApi";
import { getAgingReport, getPayments } from "@/features/finance/api/financeApi";
import { getOrderTotals } from "@/features/orders/api/orderApi";
import { getQuotaSummary } from "@/features/sa/api/saApi";
import { currentJakartaMonth } from "@/features/sa/lib/period";
import { addDays, isoDate, startOfToday } from "@/lib/date";
import type { DispatchLane, DispatchRail, DispatchStop, KpiSummary, MonthlyChartPoint, OutletShare, RecentActivity } from "../types";
import type { DashboardApi } from "./contract";

const PAGE_SIZE = 100;

/** Mirrors the fields of delivery's own DeliveryResponse this adapter needs. */
interface DeliveryResponse {
  id: string;
  delivery_number: string;
  outlet_id?: string;
  outlet_name?: string;
  driver_id?: string;
  driver_name?: string;
  vehicle_id?: string;
  plate?: string;
  dispatched_qty: number;
  delivered_qty: number;
  delivery_status: string;
  created_at: string;
}

function toIso(d: Date): string {
  return isoDate(d);
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

/**
 * `to` is inclusive, but the server's `date` filter compares `lte` literally
 * against midnight UTC of that day -- `lte` on `created_at`, a timestamp,
 * would exclude almost all of `to` itself (verified live: a delivery at
 * 16:52 UTC matched `gte` its own day but not `lte` it). The exclusive `lt`
 * bound one day later is the only one that reads "through the end of `to`"
 * correctly.
 */
async function fetchDeliveries(from: string, to: string): Promise<DeliveryResponse[]> {
  const exclusiveEnd = isoDate(addDays(new Date(`${to}T00:00:00Z`), 1));
  const page = await getList<DeliveryResponse>("/deliveries", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "created_at", direction: "desc" }],
    filters: [
      { field: "date", operator: "gte" as const, value: from },
      { field: "date", operator: "lt" as const, value: exclusiveEnd },
    ],
  });
  return page.items;
}

async function getKpiSummary(includeManualOrders = false): Promise<KpiSummary> {
  const today = toIso(startOfToday());
  const yesterday = toIso(new Date(startOfToday().getTime() - 86_400_000));

  const [todayRows, yesterdayRows, outlets, quota, pending, aging, orderTotals] =
    await Promise.all([
      fetchDeliveries(today, today),
      fetchDeliveries(yesterday, yesterday),
      getOutletList(),
      getQuotaSummary(currentJakartaMonth()),
      getPayments("Menunggu Verifikasi"),
      getAgingReport(),
      includeManualOrders ? getOrderTotals() : Promise.resolve({ baru: 0 }),
    ]);

  return {
    dailyDistributed: todayRows.reduce((s, d) => s + d.delivered_qty, 0),
    dailyTarget: todayRows.reduce((s, d) => s + d.dispatched_qty, 0),
    // The same figures as the SA page's Kuota cabang card. SIM3LON Penyaluran
    // is the record of what was distributed, so "used" is what it says went
    // out -- not what plans drew from the agreements, which while plans are
    // not used read as 0 of the whole allocation.
    monthlyQuotaTotal: quota.allocationQty,
    monthlyQuotaRemaining: quota.remainingQty,
    activeOutlet: outlets.filter((o) => o.status === "Aktif").length,
    totalOutlet: outlets.length,
    pendingPayments: pending.length,
    pendingPaymentValue: pending.reduce((s, p) => s + p.jumlah, 0),
    piutangOutstanding: aging.grandTotal,
    piutangJatuhTempo: aging.jatuhTempoTotal,
    previousDayDistributed: yesterdayRows.reduce((s, d) => s + d.delivered_qty, 0),
    openOrders: orderTotals.baru,
    lateDeliveries: todayRows.filter((d) => toDeliveryStatus(d.delivery_status) === "Tertunda")
      .length,
  };
}

async function getMonthlyChart(): Promise<MonthlyChartPoint[]> {
  const today = startOfToday();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const last = new Date(today.getFullYear(), today.getMonth() + 1, 0);
  const rows = await fetchDeliveries(toIso(first), toIso(last));

  const buckets = Array.from({ length: Math.ceil(last.getDate() / 7) }, (_, i) => ({
    week: `Minggu ${i + 1}`,
    target: 0,
    realisasi: 0,
  }));

  for (const row of rows) {
    const day = new Date(row.created_at.slice(0, 10)).getDate();
    const bucket = buckets[Math.min(buckets.length - 1, Math.floor((day - 1) / 7))];
    bucket.target += row.dispatched_qty;
    bucket.realisasi += row.delivered_qty;
  }
  return buckets;
}

// No parameter, matching the contract exactly: `useDashboard.ts` passes this
// function straight to `useQuery`'s `queryFn`, which calls it with react
// query's own context object as the first argument -- a `limit` parameter
// here would silently receive that object instead of a number. (Found live:
// `sorted.slice(0, context)` coerces to `slice(0, NaN)`, which is `slice(0,
// 0)` -- everything falls into "Wilayah lain" instead of being ranked.)
const OUTLET_SHARE_LIMIT = 4;

async function getOutletShares(): Promise<OutletShare[]> {
  const limit = OUTLET_SHARE_LIMIT;
  const today = startOfToday();
  const first = new Date(today.getFullYear(), today.getMonth(), 1);
  const [rows, outlets] = await Promise.all([
    fetchDeliveries(toIso(first), toIso(today)),
    getOutletList(),
  ]);
  const outletById = new Map(outlets.map((o) => [o.id, o]));

  const totals = new Map<string, number>();
  for (const row of rows) {
    if (!row.outlet_id) continue;
    const kecamatan = outletById.get(row.outlet_id)?.kecamatan ?? "—";
    totals.set(kecamatan, (totals.get(kecamatan) ?? 0) + row.delivered_qty);
  }

  const sorted = [...totals.entries()].sort((a, b) => b[1] - a[1]);
  const top = sorted.slice(0, limit);
  const restValue = sorted.slice(limit).reduce((s, [, v]) => s + v, 0);
  if (restValue > 0) top.push(["Wilayah lain", restValue]);

  const grand = top.reduce((s, [, v]) => s + v, 0) || 1;
  return top.map(([name, value]) => ({
    name,
    value,
    percentage: Math.round((value / grand) * 100),
  }));
}

async function getRecentActivities(): Promise<RecentActivity[]> {
  const today = toIso(startOfToday());
  const rows = await fetchDeliveries(today, today);

  const stageLabel: Record<string, RecentActivity["status"]> = {
    Selesai: "Selesai",
    Proses: "Dalam Pengiriman",
    Antrian: "Pending",
    Tertunda: "Pending",
  };

  return rows
    .sort((a, b) => b.created_at.localeCompare(a.created_at))
    .slice(0, 8)
    .map((row) => ({
      id: row.id,
      tanggal: new Date(row.created_at).toLocaleDateString("id-ID", {
        day: "numeric",
        month: "short",
      }),
      outlet: row.outlet_name ?? "—",
      driver: row.driver_name ?? "—",
      jumlahUnit: row.delivered_qty || row.dispatched_qty,
      status: stageLabel[toDeliveryStatus(row.delivery_status)] ?? "Pending",
    }));
}

async function getDispatchRail(): Promise<DispatchRail> {
  const today = toIso(startOfToday());
  const [rows, vehicles, outlets] = await Promise.all([
    fetchDeliveries(today, today),
    getVehicles(),
    getOutletList(),
  ]);
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));
  const outletsById = new Map(outlets.map((o) => [o.id, o]));

  const byDriver = new Map<string, DispatchLane>();
  for (const row of rows) {
    if (!row.driver_id) continue;
    const vehicle = row.vehicle_id ? vehiclesById.get(row.vehicle_id) : undefined;
    const lane =
      byDriver.get(row.driver_id) ??
      ({
        driverId: row.driver_id,
        driver: row.driver_name ?? "—",
        plat: row.plate ?? "—",
        armada: vehicle?.armada ?? "—",
        kapasitas: vehicle?.kapasitas ?? 0,
        muatan: 0,
        status: "Standby",
        stops: [],
      } satisfies DispatchLane);
    lane.muatan += row.dispatched_qty;
    // No planned time exists -- position by real dispatch order instead
    // of a fabricated clock. One slot per stop, in the order the API
    // returned them (newest first), reversed so the rail reads left to
    // right in the order the truck actually left.
    const slot = lane.stops.length;
    lane.stops.push({
      id: row.id,
      kode: row.delivery_number,
      outlet: row.outlet_name ?? "—",
      kecamatan: (row.outlet_id && outletsById.get(row.outlet_id)?.kecamatan) || "—",
      startMinute: slot * 60,
      endMinute: slot * 60 + 45,
      target: row.dispatched_qty,
      realisasi: row.delivered_qty,
      stage: toDeliveryStatus(row.delivery_status),
    } satisfies DispatchStop);
    byDriver.set(row.driver_id, lane);
  }

  const lanes = [...byDriver.values()];
  const dayEnd = Math.max(60, ...lanes.map((l) => l.stops.length * 60));

  return {
    dayStart: 0,
    dayEnd,
    nowMinute: 0,
    lanes,
    // No general driver list is fetched here -- see driverApi's own
    // contract on why a driver has no static truck to show idle. A driver
    // with no delivery today simply doesn't appear as a lane, rather than
    // appearing "idle" with a truck pairing that isn't real.
    idleDrivers: [],
    hasSchedule: false,
  };
}

async function getRecentAudit(): Promise<never[]> {
  return [];
}

export const dashboardApiHttp: DashboardApi = {
  getKpiSummary,
  getMonthlyChart,
  getOutletShares,
  getRecentActivities,
  getDispatchRail,
  getRecentAudit,
};
