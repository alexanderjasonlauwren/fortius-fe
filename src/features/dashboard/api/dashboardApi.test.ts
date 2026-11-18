import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter shapes `GET /dashboard/summary` into Beranda's tiles
 * (Round 1 G15). The sums themselves are the server's, tested there; these
 * pin what the console does with them.
 */

const getOne = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  getAllPages: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
}));

const holds = vi.fn<(permission: string) => boolean>(() => true);
vi.mock("@/features/rbac/holds", () => ({ holds: (p: string) => holds(p) }));

const activeScope = vi.fn(() => ({ branchId: null as string | null }));
vi.mock("@/lib/scope", () => ({ getActiveScope: () => activeScope(), scopeKey: () => ["t"] }));

const { dashboardApiHttp, toDashboardSummary } = await import("./dashboardApi.http");
type SummaryResponse = Parameters<typeof toDashboardSummary>[0];

const DRIVER_ID = "22222222-2222-4222-8222-222222222222";

function stop(overrides: Record<string, unknown> = {}) {
  return {
    id: "d-1",
    delivery_number: "SJ-0001",
    outlet_name: "Pangkalan Ahmad",
    district: "Sidorejo",
    driver_id: DRIVER_ID,
    driver_name: "Budi",
    plate: "H 1234 AB",
    vehicle_label: "Isuzu Elf NMR",
    capacity_qty: 120,
    dispatched_qty: 100,
    delivered_qty: 80,
    delivery_status: "delivered",
    created_at: "2026-11-18T08:00:00+07:00",
    ...overrides,
  };
}

function summary(overrides: Partial<SummaryResponse> = {}): SummaryResponse {
  return {
    date: "2026-11-18",
    daily_target_qty: 1320,
    days: [
      { date: "2026-11-17", dispatched_qty: 60, delivered_qty: 60, failed_stops: 0 },
      { date: "2026-11-18", dispatched_qty: 150, delivered_qty: 80, failed_stops: 1 },
    ],
    districts: [{ district: "Sidorejo", delivered_qty: 140 }],
    stops: [stop()],
    outlets: { active: 8, total: 9 },
    quota: { allocation_qty: 20450, remaining_qty: 13650 },
    pending_payments: { count: 2, amount: 400_000 },
    open_orders: 3,
    ...overrides,
  };
}

beforeEach(() => {
  getOne.mockReset();
  activeScope.mockReturnValue({ branchId: null });
});

describe("getSummary", () => {
  it("is one request, naming the scope bar's branch when one is picked", async () => {
    getOne.mockResolvedValue(summary());
    await dashboardApiHttp.getSummary();
    expect(getOne).toHaveBeenCalledWith("/dashboard/summary");

    activeScope.mockReturnValue({ branchId: "b-1" });
    await dashboardApiHttp.getSummary();
    expect(getOne).toHaveBeenLastCalledWith("/dashboard/summary?branch_id=b-1");
    expect(getOne).toHaveBeenCalledTimes(2);
  });

  // useDashboard passes it bare to useQuery's queryFn, which calls it with its
  // own context object: a declared parameter would silently receive that.
  it("takes no parameters", () => {
    expect(dashboardApiHttp.getSummary.length).toBe(0);
  });
});

describe("the KPI tiles", () => {
  it("reads today's and yesterday's figures from the server's days", () => {
    const { kpi } = toDashboardSummary(summary());
    expect(kpi).toMatchObject({
      dailyDistributed: 80,
      dailyTarget: 150,
      previousDayDistributed: 60,
      lateDeliveries: 1,
      activeOutlet: 8,
      totalOutlet: 9,
      pendingPayments: 2,
      pendingPaymentValue: 400_000,
      openOrders: 3,
      monthlyQuotaTotal: 20450,
      monthlyQuotaRemaining: 13650,
    });
  });

  it("measures a day with nothing dispatched against the tenant's Target harian", () => {
    const { kpi } = toDashboardSummary(summary({ days: [] }));
    expect(kpi.dailyTarget).toBe(1320);
    expect(kpi.dailyDistributed).toBe(0);
  });

  it("keeps a figure the role may not read as unknown, not zero", () => {
    const { kpi } = toDashboardSummary(summary({ pending_payments: null }));
    expect(kpi.pendingPayments).toBeNull();
    expect(kpi.pendingPaymentValue).toBeNull();
  });
});

describe("the month chart", () => {
  it("buckets this month's days into 7-day weeks and leaves out last month's yesterday", () => {
    const chart = toDashboardSummary(summary({
      date: "2026-11-01",
      days: [
        { date: "2026-10-31", dispatched_qty: 999, delivered_qty: 999, failed_stops: 0 },
        { date: "2026-11-01", dispatched_qty: 100, delivered_qty: 80, failed_stops: 0 },
        { date: "2026-11-08", dispatched_qty: 40, delivered_qty: 40, failed_stops: 0 },
      ],
    })).monthlyChart;
    expect(chart).toHaveLength(5);
    expect(chart[0]).toMatchObject({ week: "Minggu 1", target: 100, realisasi: 80 });
    expect(chart[1]).toMatchObject({ week: "Minggu 2", target: 40, realisasi: 40 });
  });
});

describe("the kecamatan shares", () => {
  it("keeps the four largest and folds the rest into Wilayah lain", () => {
    const shares = toDashboardSummary(summary({
      districts: [
        { district: "A", delivered_qty: 10 },
        { district: "Sidorejo", delivered_qty: 50 },
        { district: "B", delivered_qty: 20 },
        { district: "C", delivered_qty: 15 },
        { district: "D", delivered_qty: 12 },
      ],
    })).outletShares;
    expect(shares).toHaveLength(5);
    expect(shares[0]).toMatchObject({ name: "Sidorejo", value: 50 });
    expect(shares[4]).toMatchObject({ name: "Wilayah lain", value: 10 });
  });
});

describe("the activity table", () => {
  it("shows today's stops newest first, capped at 8", () => {
    const stops = Array.from({ length: 10 }, (_, i) =>
      stop({ id: `d-${i}`, created_at: `2026-11-18T0${i}:00:00+07:00` }));
    const activities = toDashboardSummary(summary({ stops })).recentActivities;
    expect(activities).toHaveLength(8);
    expect(activities[0]).toMatchObject({ id: "d-9", outlet: "Pangkalan Ahmad", status: "Selesai" });
  });
});

describe("the dispatch rail", () => {
  it("draws one lane per driver, with no fabricated schedule", () => {
    const rail = toDashboardSummary(summary({ stops: [stop(), stop({ id: "d-2", district: null })] })).rail;
    expect(rail.hasSchedule).toBe(false);
    expect(rail.lanes).toHaveLength(1);
    expect(rail.lanes[0]).toMatchObject({ driver: "Budi", armada: "Isuzu Elf NMR", kapasitas: 120, muatan: 200 });
    expect(rail.lanes[0].stops.map((s) => s.kecamatan)).toEqual(["Sidorejo", "—"]);
  });

  it("shows no truck detail to a role the server gave none", () => {
    const rail = toDashboardSummary(summary({
      stops: [stop({ vehicle_label: undefined, capacity_qty: undefined })],
    })).rail;
    expect(rail.lanes[0]).toMatchObject({ armada: "—", kapasitas: 0 });
  });
});

// Regression 2026-11-02: "Jejak aktivitas" was always empty -- nothing served
// the audit trail the middleware writes.
describe("getRecentAudit", () => {
  it("reads the tenant's recent writes and says them in words", async () => {
    holds.mockReturnValue(true);
    getOne.mockResolvedValue([
      { occurred_at: "2026-11-02T03:00:00Z", actor: "finance", module: "payments", action: "create", entity: "verify" },
    ]);
    const rows = await dashboardApiHttp.getRecentAudit(5);
    expect(getOne).toHaveBeenCalledWith("/audit-trails/recent?limit=5");
    expect(rows[0]).toMatchObject({ actor: "finance", summary: "Penerimaan kas diverifikasi", at: "2026-11-02T03:00:00Z" });
  });

  it("does not ask for a trail the role may not read", async () => {
    holds.mockImplementation((p) => p !== "audit.read.audit_trails");
    expect(await dashboardApiHttp.getRecentAudit(5)).toEqual([]);
    expect(getOne).not.toHaveBeenCalled();
    holds.mockReturnValue(true);
  });
});
