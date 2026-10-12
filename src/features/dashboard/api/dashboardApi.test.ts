import { describe, expect, it, vi, beforeEach } from "vitest";
import { isoDate, startOfToday } from "@/lib/date";

/**
 * The HTTP adapter's composition of the now-real orders/reports/finance/sa
 * feature APIs into the dashboard's own KPI, chart and rail shapes.
 */

const getList = vi.fn();
vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: vi.fn(),
  send: vi.fn(),
  upload: vi.fn(),
}));

const getOutletList = vi.fn();
vi.mock("@/features/outlet/api/outletApi", () => ({
  getOutletList: (...args: unknown[]) => getOutletList(...args),
}));

const getVehicles = vi.fn();
vi.mock("@/features/vehicles/api/vehicleApi", () => ({
  getVehicles: (...args: unknown[]) => getVehicles(...args),
}));

const getAgingReport = vi.fn();
const getPayments = vi.fn();
vi.mock("@/features/finance/api/financeApi", () => ({
  getAgingReport: (...args: unknown[]) => getAgingReport(...args),
  getPayments: (...args: unknown[]) => getPayments(...args),
}));

const getOrderTotals = vi.fn();
vi.mock("@/features/orders/api/orderApi", () => ({
  getOrderTotals: (...args: unknown[]) => getOrderTotals(...args),
}));

const getSAList = vi.fn();
vi.mock("@/features/sa/api/saApi", () => ({
  getSAList: (...args: unknown[]) => getSAList(...args),
}));

const { dashboardApiHttp } = await import("./dashboardApi.http");

const TODAY = isoDate(startOfToday());
const YESTERDAY = isoDate(new Date(startOfToday().getTime() - 86_400_000));

const OUTLET_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const VEHICLE_ID = "33333333-3333-4333-8333-333333333333";

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: "44444444-4444-4444-8444-444444444444",
    delivery_number: "SJ-0001",
    outlet_id: OUTLET_ID,
    outlet_name: "Pangkalan Ahmad",
    driver_id: DRIVER_ID,
    driver_name: "Budi",
    vehicle_id: VEHICLE_ID,
    plate: "H 1234 AB",
    dispatched_qty: 100,
    delivered_qty: 80,
    delivery_status: "delivered",
    created_at: `${TODAY}T08:00:00+07:00`,
    ...overrides,
  };
}

function agreement(overrides: Record<string, unknown> = {}) {
  return {
    id: "sa-1",
    status: "Aktif",
    periodeMulai: "2020-01-01",
    periodeBerakhir: "2099-12-31",
    totalKuota: 10000,
    sisaKuota: 4000,
    ...overrides,
  };
}

/** Routes each fetch to the fixture matching the endpoint/date it targets. */
function mockDeliveries(byDate: Record<string, unknown[]>) {
  getList.mockImplementation((path: string, params: { filters?: { field: string; value: string }[] }) => {
    if (path !== "/deliveries") throw new Error(`unexpected path: ${path}`);
    const gte = params.filters?.find((f) => f.field === "date")?.value;
    return Promise.resolve({ items: (gte && byDate[gte]) ?? [] });
  });
}

beforeEach(() => {
  getList.mockReset();
  getOutletList.mockReset().mockResolvedValue([
    { id: OUTLET_ID, nama: "Pangkalan Ahmad", kecamatan: "Sidorejo", status: "Aktif" },
  ]);
  getVehicles.mockReset().mockResolvedValue([{ id: VEHICLE_ID, armada: "Isuzu Elf NMR", kapasitas: 120 }]);
  getAgingReport.mockReset().mockResolvedValue({ grandTotal: 500_000, jatuhTempoTotal: 200_000 });
  getPayments.mockReset().mockResolvedValue([{ jumlah: 300_000 }, { jumlah: 100_000 }]);
  getOrderTotals.mockReset().mockResolvedValue({ baru: 3 });
  getSAList.mockReset().mockResolvedValue([agreement()]);
});

describe("getKpiSummary", () => {
  it.each([undefined, false])("never requests manual-order totals when intake is external or unknown (%s)", async (includeOrders) => {
    mockDeliveries({ [TODAY]: [], [YESTERDAY]: [] });
    const kpi = await dashboardApiHttp.getKpiSummary(includeOrders);
    expect(kpi.openOrders).toBe(0);
    expect(getOrderTotals).not.toHaveBeenCalled();
  });
  it("composes every figure from the real feature APIs, not a second computation", async () => {
    mockDeliveries({
      [TODAY]: [delivery(), delivery({ delivery_status: "failed", dispatched_qty: 50, delivered_qty: 0 })],
      [YESTERDAY]: [delivery({ delivered_qty: 60 })],
    });

    const kpi = await dashboardApiHttp.getKpiSummary(true);

    expect(kpi.dailyDistributed).toBe(80);
    expect(kpi.dailyTarget).toBe(150);
    expect(kpi.previousDayDistributed).toBe(60);
    expect(kpi.lateDeliveries).toBe(1);
    expect(kpi.activeOutlet).toBe(1);
    expect(kpi.totalOutlet).toBe(1);
    expect(kpi.pendingPayments).toBe(2);
    expect(kpi.pendingPaymentValue).toBe(400_000);
    expect(kpi.piutangOutstanding).toBe(500_000);
    expect(kpi.piutangJatuhTempo).toBe(200_000);
    expect(kpi.openOrders).toBe(3);
    expect(kpi.monthlyQuotaTotal).toBe(10_000);
    expect(kpi.monthlyQuotaRemaining).toBe(4_000);
    expect(getPayments).toHaveBeenCalledWith("Menunggu Verifikasi");
  });

  it("excludes a draft agreement and one outside today's period from the quota total", async () => {
    mockDeliveries({ [TODAY]: [], [YESTERDAY]: [] });
    getSAList.mockResolvedValue([
      agreement({ id: "live", totalKuota: 1000, sisaKuota: 500 }),
      agreement({ id: "draft", status: "Draft", totalKuota: 9999, sisaKuota: 9999 }),
      agreement({ id: "expired", periodeBerakhir: "2020-01-01", totalKuota: 9999, sisaKuota: 9999 }),
    ]);

    const kpi = await dashboardApiHttp.getKpiSummary(true);

    expect(kpi.monthlyQuotaTotal).toBe(1000);
    expect(kpi.monthlyQuotaRemaining).toBe(500);
  });
});

describe("getMonthlyChart", () => {
  it("buckets this month's deliveries into 7-day weeks", async () => {
    const today = startOfToday();
    const monthStart = isoDate(new Date(today.getFullYear(), today.getMonth(), 1));
    mockDeliveries({
      [monthStart]: [
        delivery({ created_at: `${monthStart}T08:00:00+07:00` }),
        delivery({
          created_at: isoDate(new Date(today.getFullYear(), today.getMonth(), 8)) + "T08:00:00+07:00",
          dispatched_qty: 40,
          delivered_qty: 40,
        }),
      ],
    });

    const chart = await dashboardApiHttp.getMonthlyChart();

    expect(chart[0]).toMatchObject({ week: "Minggu 1", target: 100, realisasi: 80 });
    expect(chart[1]).toMatchObject({ week: "Minggu 2", target: 40, realisasi: 40 });
  });
});

describe("getOutletShares", () => {
  it("sums delivered_qty by kecamatan and buckets the rest past the limit", async () => {
    const monthStart = isoDate(
      new Date(startOfToday().getFullYear(), startOfToday().getMonth(), 1),
    );
    mockDeliveries({
      [monthStart]: [
        delivery({ delivered_qty: 50 }),
        delivery({ outlet_id: "o2", delivered_qty: 40 }),
        delivery({ outlet_id: "o3", delivered_qty: 30 }),
        delivery({ outlet_id: "o4", delivered_qty: 20 }),
        delivery({ outlet_id: "o5", delivered_qty: 10 }),
      ],
    });
    getOutletList.mockResolvedValue([
      { id: OUTLET_ID, kecamatan: "Sidorejo" },
      { id: "o2", kecamatan: "Ngaliyan" },
      { id: "o3", kecamatan: "Tembalang" },
      { id: "o4", kecamatan: "Gunungpati" },
      { id: "o5", kecamatan: "Genuk" },
    ]);

    const shares = await dashboardApiHttp.getOutletShares();

    // Default limit is 4 -- the fifth kecamatan folds into "Wilayah lain".
    expect(shares).toHaveLength(5);
    expect(shares[0]).toMatchObject({ name: "Sidorejo", value: 50 });
    expect(shares[4]).toMatchObject({ name: "Wilayah lain", value: 10 });
  });
});

describe("getRecentActivities", () => {
  it("maps today's deliveries, newest first, capped at 8", async () => {
    const rows = Array.from({ length: 10 }, (_, i) =>
      delivery({
        id: `d-${i}`,
        created_at: `${TODAY}T${String(i).padStart(2, "0")}:00:00+07:00`,
      }),
    );
    mockDeliveries({ [TODAY]: rows });

    const activities = await dashboardApiHttp.getRecentActivities();

    expect(activities).toHaveLength(8);
    expect(activities[0].id).toBe("d-9");
    expect(activities[0].outlet).toBe("Pangkalan Ahmad");
    expect(activities[0].status).toBe("Selesai");
  });
});

describe("getDispatchRail", () => {
  it("groups today's deliveries into one lane per driver with no fabricated schedule", async () => {
    mockDeliveries({
      [TODAY]: [delivery(), delivery({ id: "d-2", delivery_number: "SJ-0002" })],
    });

    const rail = await dashboardApiHttp.getDispatchRail();

    expect(rail.hasSchedule).toBe(false);
    expect(rail.lanes).toHaveLength(1);
    expect(rail.lanes[0].driver).toBe("Budi");
    expect(rail.lanes[0].armada).toBe("Isuzu Elf NMR");
    expect(rail.lanes[0].kapasitas).toBe(120);
    expect(rail.lanes[0].stops).toHaveLength(2);
    expect(rail.lanes[0].stops[0].kecamatan).toBe("Sidorejo");
  });
});

describe("getRecentAudit", () => {
  it("returns empty -- nothing writes to the audit trail on the real service", async () => {
    expect(await dashboardApiHttp.getRecentAudit()).toEqual([]);
  });
});

// useDashboard.ts passes getKpiSummary, getDispatchRail, getMonthlyChart,
// getOutletShares and getRecentActivities straight to useQuery's own
// queryFn, unwrapped -- react-query calls each with its own context object
// as the first argument. Any of these declaring an optional parameter would
// silently receive that object instead, the same way getOutletShares's own
// `limit` did. Locking every one of them at zero declared parameters is
// what makes the whole class of bug impossible here, not just the one
// instance that was actually found.
describe("every function useDashboard.ts passes bare to queryFn", () => {
  it.each([
    ["getKpiSummary", dashboardApiHttp.getKpiSummary],
    ["getDispatchRail", dashboardApiHttp.getDispatchRail],
    ["getMonthlyChart", dashboardApiHttp.getMonthlyChart],
    ["getOutletShares", dashboardApiHttp.getOutletShares],
    ["getRecentActivities", dashboardApiHttp.getRecentActivities],
  ])("%s takes no parameters", (_name, fn) => {
    expect(fn.length).toBe(0);
  });
});
