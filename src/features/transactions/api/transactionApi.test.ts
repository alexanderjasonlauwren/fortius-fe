import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping from the real /transactions list onto the
 * console's ledger row, following reportApi.test.ts's own pattern.
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

const getDrivers = vi.fn();
vi.mock("@/features/drivers/api/driverApi", () => ({
  getDrivers: (...args: unknown[]) => getDrivers(...args),
}));

const holds = vi.fn<(permission: string) => boolean>(() => true);
vi.mock("@/features/rbac/holds", () => ({ holds: (p: string) => holds(p) }));

const exportCsv = vi.fn();
const exportExcel = vi.fn();
vi.mock("@/lib/export", () => ({
  exportCsv: (...args: unknown[]) => exportCsv(...args),
  exportExcel: (...args: unknown[]) => exportExcel(...args),
  timestampSuffix: () => "20260912-0000",
}));

const { transactionApiHttp } = await import("./transactionApi.http");

const OUTLET_ID = "11111111-1111-4111-8111-111111111111";
const DRIVER_ID = "22222222-2222-4222-8222-222222222222";

function row(overrides: Record<string, unknown> = {}) {
  return {
    id: "33333333-3333-4333-8333-333333333333",
    delivery_number: "SJ-0001",
    plan_number: "DO-0001",
    agreement_number: "SA-0001",
    outlet_id: OUTLET_ID,
    outlet_code: "OUT-1",
    outlet_name: "Pangkalan Ahmad",
    outlet_district: "Sidorejo",
    driver_id: DRIVER_ID,
    driver_name: "Budi",
    plate: "H 1234 AB",
    dispatched_qty: 100,
    delivered_qty: 80,
    delivery_status: "delivered",
    created_at: "2026-09-10T08:00:00+07:00",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOutletList.mockReset().mockResolvedValue([
    { id: OUTLET_ID, nama: "Pangkalan Ahmad", kecamatan: "Sidorejo" },
  ]);
  getDrivers.mockReset().mockResolvedValue([{ id: DRIVER_ID, nama: "Budi" }]);
  exportCsv.mockReset();
  exportExcel.mockReset();
});

describe("getTransactions", () => {
  it("maps an unbilled, unfunded delivery honestly -- no invoice fields, nominal 0", async () => {
    getList.mockResolvedValue({ items: [row()] });

    const [tx] = await transactionApiHttp.getTransactions();

    expect(tx.suratJalan).toBe("SJ-0001");
    expect(tx.invoice).toBe("—");
    expect(tx.rencana).toBe("DO-0001");
    expect(tx.nomorSA).toBe("SA-0001");
    expect(tx.kecamatan).toBe("Sidorejo");
    expect(tx.target).toBe(100);
    expect(tx.realisasi).toBe(80);
    expect(tx.selisih).toBe(-20);
    expect(tx.nominal).toBe(0);
    expect(tx.bank).toBe("—");
    expect(tx.noRekening).toBe("—");
    expect(tx.diverifikasiOleh).toBe("—");
    expect(tx.statusBayar).toBe("Belum ditagih");
    expect(tx.jamRencana).toBe("");
  });

  it("maps a billed and funded delivery's invoice and payment fields through", async () => {
    getList.mockResolvedValue({
      items: [
        row({
          invoice_id: "44444444-4444-4444-8444-444444444444",
          invoice_number: "INV-0001",
          total_amount: 500_000,
          payment_status: "paid",
          paid_at: "2026-09-11T10:00:00+07:00",
          bank_name: "Bank Test",
          bank_account_last4: "4321",
          verified_by_name: "Finance Officer",
          notes: "Lunas di tempat",
        }),
      ],
    });

    const [tx] = await transactionApiHttp.getTransactions();

    expect(tx.invoice).toBe("INV-0001");
    expect(tx.nominal).toBe(500_000);
    expect(tx.statusBayar).toBe("Lunas");
    expect(tx.tanggalBayar).toBe("2026-09-11");
    expect(tx.bank).toBe("Bank Test");
    expect(tx.noRekening).toBe("4321");
    expect(tx.diverifikasiOleh).toBe("Finance Officer");
    expect(tx.keterangan).toBe("Lunas di tempat");
  });

  it.each([
    ["pending", "Antrian"],
    ["on_route", "Proses"],
    ["delivered", "Selesai"],
    ["partial", "Selesai"],
    ["failed", "Tertunda"],
    ["cancelled", "Antrian"],
  ])("maps delivery_status %s to statusKirim %s", async (wire, expected) => {
    getList.mockResolvedValue({ items: [row({ delivery_status: wire })] });
    const [tx] = await transactionApiHttp.getTransactions();
    expect(tx.statusKirim).toBe(expected);
  });

  it.each([
    ["unpaid", "Terbit"],
    ["partial", "Sebagian"],
    ["paid", "Lunas"],
    ["overdue", "Jatuh Tempo"],
    ["waived", "Lunas"],
    ["credited", "Lunas"],
  ])("maps payment_status %s to statusBayar %s", async (wire, expected) => {
    getList.mockResolvedValue({ items: [row({ payment_status: wire })] });
    const [tx] = await transactionApiHttp.getTransactions();
    expect(tx.statusBayar).toBe(expected);
  });

  /**
   * The upper bound is `lt` the day after `to`, not `lte` `to` itself:
   * `date` filters `created_at`, a timestamp, and the server compares `lte`
   * literally against midnight UTC -- `lte` `to` would exclude almost all of
   * that day (verified live against the running service).
   */
  it("sends outlet_id/driver_id/date as server-side filters", async () => {
    getList.mockResolvedValue({ items: [] });
    await transactionApiHttp.getTransactions({
      from: "2026-09-01",
      to: "2026-09-30",
      outletId: OUTLET_ID,
      driverId: DRIVER_ID,
    });

    const [, params] = getList.mock.calls[0];
    expect(params.filters).toEqual(
      expect.arrayContaining([
        { field: "date", operator: "gte", value: "2026-09-01" },
        { field: "date", operator: "lt", value: "2026-10-01" },
        { field: "outlet_id", operator: "eq", value: OUTLET_ID },
        { field: "driver_id", operator: "eq", value: DRIVER_ID },
      ]),
    );
  });

  it("filters statusKirim, statusBayar, kecamatan and search client-side", async () => {
    getList.mockResolvedValue({
      items: [
        row({ delivery_status: "delivered" }),
        row({ delivery_status: "pending", delivery_number: "SJ-0002" }),
      ],
    });

    const byStatus = await transactionApiHttp.getTransactions({ statusKirim: "Antrian" });
    expect(byStatus).toHaveLength(1);
    expect(byStatus[0].suratJalan).toBe("SJ-0002");

    const bySearch = await transactionApiHttp.getTransactions({ search: "sj-0002" });
    expect(bySearch).toHaveLength(1);
    expect(bySearch[0].suratJalan).toBe("SJ-0002");
  });
});

describe("getTransactionSummary", () => {
  it("sums nominal by the mapped statusBayar bucket", async () => {
    getList.mockResolvedValue({
      items: [
        row({ payment_status: "paid", total_amount: 100_000 }),
        row({ payment_status: "unpaid", total_amount: 50_000, delivery_number: "SJ-0002" }),
        row({ delivery_number: "SJ-0003" }), // no invoice at all
      ],
    });

    const summary = await transactionApiHttp.getTransactionSummary();

    expect(summary.jumlah).toBe(3);
    expect(summary.terverifikasi).toBe(100_000);
    expect(summary.menunggu).toBe(50_000);
    expect(summary.belumDitagih).toBe(0);
    expect(summary.outlet).toBe(1);
  });
});

describe("getTransactionFilterOptions", () => {
  it("reads the real, complete outlet and driver lists, not just the current page", async () => {
    const options = await transactionApiHttp.getTransactionFilterOptions();

    expect(options.outlet).toEqual([{ id: OUTLET_ID, label: "Pangkalan Ahmad" }]);
    expect(options.kecamatan).toEqual(["Sidorejo"]);
    expect(options.drivers).toEqual([{ id: DRIVER_ID, label: "Budi" }]);
  });

  // Regression 2026-10-24 F16: the finance officer may open the sales list
  // but not read drivers, and every visit fired a 403 for the filter.
  it("does not ask for drivers the user may not read", async () => {
    getDrivers.mockClear();
    holds.mockImplementation((p) => p !== "masterdata.read.drivers");
    const options = await transactionApiHttp.getTransactionFilterOptions();
    holds.mockImplementation(() => true);

    expect(getDrivers).not.toHaveBeenCalled();
    expect(options.drivers).toEqual([]);
    expect(options.outlet).toEqual([{ id: OUTLET_ID, label: "Pangkalan Ahmad" }]);
  });
});

describe("exportTransactionsCsv and exportTransactionsExcel", () => {
  it("both export the fetched, filtered rows", async () => {
    getList.mockResolvedValue({ items: [row(), row({ delivery_number: "SJ-0002" })] });

    expect(await transactionApiHttp.exportTransactionsCsv()).toBe(2);
    expect(exportCsv).toHaveBeenCalledOnce();

    expect(await transactionApiHttp.exportTransactionsExcel()).toBe(2);
    expect(exportExcel).toHaveBeenCalledOnce();
  });
});
