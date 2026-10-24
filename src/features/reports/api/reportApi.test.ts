import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping from the real /deliveries, /payments and
 * /invoices lists onto the console's report shapes, following
 * financeApi.test.ts's own pattern.
 */

const getList = vi.fn();
const getOne = vi.fn();
vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: vi.fn(),
  upload: vi.fn(),
}));

const getOutletList = vi.fn();
vi.mock("@/features/outlet/api/outletApi", () => ({
  getOutletList: (...args: unknown[]) => getOutletList(...args),
}));

const getVehicles = vi.fn();
const holds = vi.fn<(permission: string) => boolean>(() => true);
vi.mock("@/features/rbac/holds", () => ({ holds: (p: string) => holds(p) }));

vi.mock("@/features/vehicles/api/vehicleApi", () => ({
  getVehicles: (...args: unknown[]) => getVehicles(...args),
}));

const getSettings = vi.fn();
vi.mock("@/features/settings/api/settingsApi", () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
}));

const exportCsv = vi.fn();
const printDocument = vi.fn();
vi.mock("@/lib/export", () => ({
  exportCsv: (...args: unknown[]) => exportCsv(...args),
  printDocument: (...args: unknown[]) => printDocument(...args),
  timestampSuffix: () => "20260911-2300",
}));

const { reportApiHttp } = await import("./reportApi.http");
const { resolveRange } = await import("./contract");

const OUTLET_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";
const VEHICLE_ID = "33333333-3333-4333-8333-333333333333";

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    outlet_id: OUTLET_ID,
    driver_id: DRIVER_ID,
    driver_name: "Budi",
    vehicle_id: VEHICLE_ID,
    plate: "H 1234 AB",
    dispatched_qty: 100,
    delivered_qty: 90,
    delivery_status: "delivered",
    created_at: "2026-09-05T08:00:00+07:00",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  // No branch has a planning start date unless a test says so.
  getOne.mockReset().mockResolvedValue({ days: [], qty: 0, total: 0 });
  getOutletList.mockReset().mockResolvedValue([
    { id: OUTLET_ID, nama: "Pangkalan Ahmad", kecamatan: "Sidorejo" },
  ]);
  getVehicles.mockReset().mockResolvedValue([
    { id: VEHICLE_ID, armada: "Isuzu Elf NMR" },
  ]);
  getSettings.mockReset().mockResolvedValue({ namaPerusahaan: "—", nomorAgen: "—" });
  exportCsv.mockReset();
  printDocument.mockReset();
});

/** Routes each fetch to the fixture matching the endpoint it targets. */
function mockLists(opts: {
  deliveries?: unknown[];
  payments?: unknown[];
  invoices?: unknown[];
}) {
  getList.mockImplementation((path: string) => {
    if (path === "/deliveries") return Promise.resolve({ items: opts.deliveries ?? [] });
    if (path === "/payments") return Promise.resolve({ items: opts.payments ?? [] });
    if (path === "/invoices") return Promise.resolve({ items: opts.invoices ?? [] });
    throw new Error(`unexpected path: ${path}`);
  });
}

describe("getReportSummary", () => {
  it("derives every figure from dispatched/delivered_qty and the wire's own statuses", async () => {
    const window = resolveRange("7h");
    mockLists({
      deliveries: [
        delivery({ delivery_status: "delivered" }),
        delivery({ delivery_status: "pending", dispatched_qty: 50, delivered_qty: 0 }),
      ],
      payments: [
        { outlet_id: OUTLET_ID, amount: 500_000, payment_date: window.to, payment_status: "verified" },
        { outlet_id: OUTLET_ID, amount: 200_000, payment_date: window.to, payment_status: "rejected" },
        // Outside the window -- must not be counted.
        { outlet_id: OUTLET_ID, amount: 999_999, payment_date: "2020-01-01", payment_status: "verified" },
      ],
      invoices: [
        { outlet_id: OUTLET_ID, total_amount: 100_000, outstanding_amount: 40_000, issued_at: window.to },
        { outlet_id: OUTLET_ID, total_amount: 1, outstanding_amount: 1, issued_at: "2020-01-01" },
      ],
    });

    const summary = await reportApiHttp.getReportSummary("7h");

    expect(summary.unitTerkirim).toBe(90);
    expect(summary.unitTarget).toBe(150);
    expect(summary.pencapaian).toBeCloseTo((90 / 150) * 100);
    expect(summary.pendapatan).toBe(500_000);
    expect(summary.ditolak).toBe(200_000);
    expect(summary.piutang).toBe(40_000);
    expect(summary.suratJalan).toBe(2);
    expect(summary.suratJalanSelesai).toBe(1);
    expect(summary.suratJalanTertunda).toBe(1);
    expect(summary.outletDilayani).toBe(1);
  });

  it("counts neither partial, failed nor cancelled deliveries as Selesai or Tertunda", async () => {
    mockLists({
      deliveries: [
        delivery({ delivery_status: "partial" }),
        delivery({ delivery_status: "failed" }),
        delivery({ delivery_status: "cancelled" }),
      ],
      payments: [],
      invoices: [],
    });

    const summary = await reportApiHttp.getReportSummary("7h");

    expect(summary.suratJalan).toBe(3);
    expect(summary.suratJalanSelesai).toBe(0);
    expect(summary.suratJalanTertunda).toBe(0);
  });

  /**
   * The upper bound is `lt` the day after the window, not `lte` its last day:
   * `date` filters `created_at`, a timestamp, and the server compares `lte`
   * literally against midnight UTC -- `lte` the last day would exclude
   * almost all of it (verified live against the running service).
   */
  it("passes the resolved range as a half-open date filter on /deliveries", async () => {
    mockLists({ deliveries: [], payments: [], invoices: [] });
    await reportApiHttp.getReportSummary("7h");

    const window = resolveRange("7h");
    const exclusiveEnd = new Date(`${window.to}T00:00:00Z`);
    exclusiveEnd.setUTCDate(exclusiveEnd.getUTCDate() + 1);
    const [, params] = getList.mock.calls.find(([path]) => path === "/deliveries")!;
    expect(params.filters).toEqual(
      expect.arrayContaining([
        { field: "date", operator: "gte", value: window.from },
        { field: "date", operator: "lt", value: exclusiveEnd.toISOString().slice(0, 10) },
      ]),
    );
  });
});

describe("getDailySeries", () => {
  it("buckets deliveries and verified payments by their own day", async () => {
    const window = resolveRange("7h");
    mockLists({
      deliveries: [delivery({ created_at: `${window.to}T10:00:00+07:00` })],
      payments: [
        { outlet_id: OUTLET_ID, amount: 300_000, payment_date: window.to, payment_status: "verified" },
        { outlet_id: OUTLET_ID, amount: 999, payment_date: window.to, payment_status: "pending" },
      ],
      invoices: [],
    });

    const series = await reportApiHttp.getDailySeries("7h");
    const last = series[series.length - 1];

    expect(last.tanggal).toBe(window.to);
    expect(last.target).toBe(100);
    expect(last.realisasi).toBe(90);
    expect(last.pendapatan).toBe(300_000);
  });
});

describe("getTopOutlet", () => {
  it("sums dispatched_qty and invoice totals per outlet, joined to outlet names", async () => {
    const window = resolveRange("7h");
    mockLists({
      deliveries: [delivery(), delivery({ dispatched_qty: 10, delivered_qty: 0 })],
      payments: [],
      invoices: [
        { outlet_id: OUTLET_ID, total_amount: 250_000, outstanding_amount: 0, issued_at: window.to },
      ],
    });

    const [row] = await reportApiHttp.getTopOutlet("7h");

    expect(row.nama).toBe("Pangkalan Ahmad");
    expect(row.kecamatan).toBe("Sidorejo");
    expect(row.unit).toBe(110);
    expect(row.suratJalan).toBe(2);
    expect(row.nilai).toBe(250_000);
  });

  /**
   * Revenue now posts at dispatch, valued at dispatched_qty (see
   * invoice.CreateFromDelivery's own doc) -- so a delivery nobody has filed
   * a driver confirmation for yet, with delivered_qty still 0, is exactly
   * the ordinary case now, not an edge case. Summing delivered_qty here
   * showed a real, already-invoiced shipment as 0 tabung beside its own
   * non-zero rupiah value.
   */
  it("counts a dispatched-but-not-yet-delivered stop, not just a completed one", async () => {
    mockLists({
      deliveries: [delivery({ delivery_status: "pending", dispatched_qty: 70, delivered_qty: 0 })],
      payments: [],
      invoices: [
        { outlet_id: OUTLET_ID, total_amount: 1_050_000, outstanding_amount: 0, issued_at: resolveRange("7h").to },
      ],
    });

    const [row] = await reportApiHttp.getTopOutlet("7h");

    expect(row.unit).toBe(70);
    expect(row.nilai).toBe(1_050_000);
  });
});

describe("getDriverPerformance", () => {
  it("joins the driver's own name/plate off the delivery row and the vehicle's armada by id", async () => {
    mockLists({
      deliveries: [
        delivery({ delivery_status: "delivered" }),
        delivery({ delivery_status: "pending", delivered_qty: 0 }),
      ],
      payments: [],
      invoices: [],
    });

    const [row] = await reportApiHttp.getDriverPerformance("7h");

    expect(row.nama).toBe("Budi");
    expect(row.plat).toBe("H 1234 AB");
    expect(row.armada).toBe("Isuzu Elf NMR");
    expect(row.suratJalan).toBe(2);
    expect(row.selesai).toBe(1);
    expect(row.tertunda).toBe(1);
    expect(row.ketepatan).toBe(50);
  });

  // Regression 2026-10-24 F16: the finance officer may open the reports but
  // not read vehicles; the plate rides on the delivery row anyway.
  it("does not ask for vehicles the user may not read", async () => {
    getVehicles.mockClear();
    holds.mockImplementation((p) => p !== "masterdata.read.vehicles");
    mockLists({ deliveries: [delivery({ delivery_status: "delivered" })], payments: [], invoices: [] });
    const [row] = await reportApiHttp.getDriverPerformance("7h");
    holds.mockImplementation(() => true);

    expect(getVehicles).not.toHaveBeenCalled();
    expect(row.plat).toBe("H 1234 AB");
    expect(row.armada).toBe("—");
  });
});

describe("exportReport and printReport", () => {
  it("exportReport writes one CSV row per day in the range", async () => {
    mockLists({ deliveries: [], payments: [], invoices: [] });
    const count = await reportApiHttp.exportReport("7h");
    expect(exportCsv).toHaveBeenCalledOnce();
    expect(count).toBe(7);
  });

  it("printReport reads the real settings placeholder rather than inventing a company name", async () => {
    mockLists({ deliveries: [], payments: [], invoices: [] });
    await reportApiHttp.printReport("7h");
    expect(printDocument).toHaveBeenCalledOnce();
    const [, html] = printDocument.mock.calls[0];
    expect(html).toContain("—");
  });
});

describe("pre-go-live SIM3LON revenue", () => {
  it("is reported beside verified payments, never folded into them", async () => {
    const window = resolveRange("30h");
    mockLists({
      payments: [
        { outlet_id: OUTLET_ID, amount: 500_000, payment_date: window.to, payment_status: "verified" },
      ],
    });
    getOne.mockResolvedValue({
      days: [{ date: window.from, qty: 10, total: 155_200 }],
      qty: 10,
      total: 155_200,
    });

    const summary = await reportApiHttp.getReportSummary("30h");
    const series = await reportApiHttp.getDailySeries("30h");

    expect(getOne).toHaveBeenCalledWith(`/sim3lon-opening-revenue?from=${window.from}&to=${window.to}`);
    expect(summary.pendapatan).toBe(500_000);
    expect(summary.pendapatanSebelumGoLive).toBe(155_200);
    expect(summary.unitSebelumGoLive).toBe(10);
    const first = series.find((point) => point.tanggal === window.from)!;
    expect(first.pendapatanSebelumGoLive).toBe(155_200);
    expect(first.pendapatan).toBe(0);
  });
});
