import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for purchases, following
 * vendorApi.test.ts's own pattern.
 */

const getList = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: vi.fn(),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { purchaseApiHttp } = await import("./purchaseApi.http");

const ID = "11111111-1111-4111-8111-111111111111";
const SUPPLIER_ID = "22222222-2222-4222-8222-222222222222";
const BRANCH_ID = "33333333-3333-4333-8333-333333333333";
const PRODUCT_ID = "44444444-4444-4444-8444-444444444444";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    purchase_number: "PB-202610-0001",
    supplier_id: SUPPLIER_ID,
    supplier_code: "VND-001",
    supplier_name: "UD. Sumber Logam",
    lines: [{ product_id: PRODUCT_ID, quantity: 2, unit_cost: 50000, subtotal: 100000 }],
    redeemed_at: "2026-10-08",
    subtotal: 100000,
    tax_percentage: 0,
    tax_amount: 0,
    total_amount: 100000,
    total_qty: 2,
    payment_status: "unpaid",
    version: 1,
    created_at: "2026-10-08T00:00:00Z",
    updated_at: "2026-10-08T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  send.mockReset();
});

describe("getPurchases", () => {
  it("maps the wire shape", async () => {
    getList.mockResolvedValue({ items: [wire()] });

    const [row] = await purchaseApiHttp.getPurchases();

    expect(row.purchaseNumber).toBe("PB-202610-0001");
    expect(row.supplierName).toBe("UD. Sumber Logam");
    expect(row.lines[0]).toMatchObject({ productId: PRODUCT_ID, quantity: 2, unitCost: 50000, subtotal: 100000 });
    expect(row.paymentStatus).toBe("unpaid");
  });

  // Caught live: GET /purchases never populates lines (N+1-avoidance,
  // same as ListJournals/ListRegistrationPackages) -- `lines: null`, not
  // `[]`. `row.lines.map(...)` threw on the real list response, and
  // React Query's own error swallowing made every purchase disappear
  // from the page instead of showing an error.
  it("reads a list row with lines: null as an empty lines array, not a throw", async () => {
    getList.mockResolvedValue({ items: [wire({ lines: null })] });

    const [row] = await purchaseApiHttp.getPurchases();

    expect(row.lines).toEqual([]);
  });

  it("sends an eq filter for a specific payment status, none for Semua", async () => {
    getList.mockResolvedValue({ items: [] });

    await purchaseApiHttp.getPurchases({ paymentStatus: "paid" });
    expect(getList.mock.calls[0][1]).toMatchObject({
      filters: [{ field: "payment_status", operator: "eq", value: "paid" }],
    });

    await purchaseApiHttp.getPurchases({ paymentStatus: "Semua" });
    expect(getList.mock.calls[1][1]).toMatchObject({ filters: [] });
  });
});

describe("recordGeneralPurchase", () => {
  it("maps a create input to the backend's wire shape, sending a plain date string", async () => {
    getList.mockResolvedValue({ items: [{ id: BRANCH_ID, is_default: true }] });
    send.mockResolvedValue(wire());

    await purchaseApiHttp.recordGeneralPurchase({
      supplierId: SUPPLIER_ID,
      date: "2026-10-08",
      lines: [{ productId: PRODUCT_ID, quantity: 2, unitCost: 50000 }],
      notes: "Pembelian timbangan",
    });

    expect(send).toHaveBeenCalledWith("post", "/purchases/general", {
      supplier_id: SUPPLIER_ID,
      branch_id: BRANCH_ID,
      date: "2026-10-08",
      lines: [{ product_id: PRODUCT_ID, quantity: 2, unit_cost: 50000 }],
      notes: "Pembelian timbangan",
    });
  });
});

describe("payPurchase", () => {
  it("sends the version and optional reference/account", async () => {
    send.mockResolvedValue(wire({ payment_status: "paid" }));

    await purchaseApiHttp.payPurchase({ id: ID, version: 1, bankReference: "TRX-001" });

    expect(send).toHaveBeenCalledWith("post", `/purchases/${ID}/pay`, {
      version: 1,
      bank_reference: "TRX-001",
      bank_account_id: undefined,
    });
  });
});
