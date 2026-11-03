import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for orders, following bankAccountApi.test.ts's
 * own pattern.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  // getAllPages walks pages through getList; one mocked call is one page.
  getAllPages: async (...args: unknown[]) => ({ items: (await getList(...args)).items, truncated: false }),
  getPage: async (path: string, params: { page?: number; pageSize?: number }, map: (row: unknown) => unknown) => {
    const result = await getList(path, params);
    return {
      items: result.items.map(map), page: params.page ?? 1, pageSize: params.pageSize ?? 50,
      hasNext: Boolean(result.pagination?.has_next), totalItems: result.pagination?.total_items,
    };
  },
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { orderApiHttp, scheduleOneOrder } = await import("./orderApi.http");

const ID = "11111111-1111-4111-8111-111111111111";
const OUTLET_ID = "22222222-2222-4222-8222-222222222222";
const PRODUCT_ID = "33333333-3333-4333-8333-333333333333";
const PLAN_ID = "44444444-4444-4444-8444-444444444444";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    order_number: "PO-SLT-20260911-0001",
    outlet_id: OUTLET_ID,
    outlet_code: "PKL-001",
    outlet_name: "Pangkalan Test",
    order_date: "2026-09-11",
    requested_delivery_date: "2026-09-12",
    order_status: "requested",
    source_channel: "staff_entry",
    lines: [
      { product_id: PRODUCT_ID, product_code: "PRD-1", product_name: "Tabung 3kg", requested_qty: 10 },
    ],
    version: 1,
    created_at: "2026-09-11T00:00:00Z",
    updated_at: "2026-09-11T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

describe("getOrders", () => {
  it("maps order_status onto the mock's own vocabulary", async () => {
    getList.mockResolvedValue({
      items: [
        wire({ order_status: "requested" }),
        wire({ id: "2", order_status: "approved" }),
        wire({ id: "3", order_status: "scheduled" }),
        wire({ id: "4", order_status: "fulfilled" }),
        wire({ id: "5", order_status: "rejected" }),
      ],
    });
    const rows = (await orderApiHttp.getOrders()).items;
    expect(rows.map((r) => r.status)).toEqual([
      "Baru",
      "Disetujui",
      "Dijadwalkan",
      "Selesai",
      "Ditolak",
    ]);
  });

  it("falls back to Baru for a status the console has no vocabulary for", async () => {
    getList.mockResolvedValue({ items: [wire({ order_status: "cancelled" })] });
    expect(((await orderApiHttp.getOrders()).items)[0].status).toBe("Baru");
  });

  it("translates a status filter into the wire's own status string", async () => {
    getList.mockResolvedValue({ items: [] });
    await orderApiHttp.getOrders({ status: "Disetujui" });
    const [, params] = getList.mock.calls[0];
    expect(params.filters).toEqual([{ field: "order_status", operator: "eq", value: "approved" }]);
  });

  it("sends no status filter for Semua", async () => {
    getList.mockResolvedValue({ items: [] });
    await orderApiHttp.getOrders({ status: "Semua" });
    const [, params] = getList.mock.calls[0];
    expect(params.filters).toBeUndefined();
  });
});

describe("toView mapping", () => {
  it("prefers the rejection reason over a free-text note", async () => {
    getList.mockResolvedValue({
      items: [wire({ order_status: "rejected", notes: "catatan asli", rejection_reason: "melebihi limit" })],
    });
    expect(((await orderApiHttp.getOrders()).items)[0].catatan).toBe("melebihi limit");
  });

  it("falls back to the note when there is no rejection", async () => {
    getList.mockResolvedValue({ items: [wire({ notes: "catatan asli" })] });
    expect(((await orderApiHttp.getOrders()).items)[0].catatan).toBe("catatan asli");
  });

  it("carries the plan link's code as kodeRencana", async () => {
    getList.mockResolvedValue({
      items: [
        wire({
          order_status: "scheduled",
          distribution_order_id: PLAN_ID,
          distribution_order_number: "RD-SLT-20260911-0001",
        }),
      ],
    });
    expect(((await orderApiHttp.getOrders()).items)[0].kodeRencana).toBe("RD-SLT-20260911-0001");
  });

  it("sums requested_qty across lines for jumlahUnit", async () => {
    getList.mockResolvedValue({
      items: [
        wire({
          lines: [
            { product_id: PRODUCT_ID, product_code: "P1", product_name: "A", requested_qty: 7 },
            { product_id: "p2", product_code: "P2", product_name: "B", requested_qty: 3 },
          ],
        }),
      ],
    });
    expect(((await orderApiHttp.getOrders()).items)[0].jumlahUnit).toBe(10);
  });

  it("does not carry a processed-at timestamp for a still-requested order", async () => {
    getList.mockResolvedValue({ items: [wire({ order_status: "requested" })] });
    expect(((await orderApiHttp.getOrders()).items)[0].diprosesPada).toBeUndefined();
  });

  it("uses updated_at as the processed-at timestamp once decided", async () => {
    getList.mockResolvedValue({
      items: [wire({ order_status: "approved", updated_at: "2026-09-11T05:00:00Z" })],
    });
    expect(((await orderApiHttp.getOrders()).items)[0].diprosesPada).toBe("2026-09-11T05:00:00Z");
  });
});

describe("approveOrder and declineOrder", () => {
  it("reads the version before approving and sends it back", async () => {
    getOne.mockResolvedValue(wire({ version: 3 }));
    send.mockResolvedValue(wire({ order_status: "approved", version: 4 }));

    await orderApiHttp.approveOrder(ID);

    expect(getOne).toHaveBeenCalledWith(`/orders/${ID}`);
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe(`/orders/${ID}/approve`);
    expect(body).toEqual({ version: 3 });
  });

  it("sends the reason along with the version on decline", async () => {
    getOne.mockResolvedValue(wire({ version: 3 }));
    send.mockResolvedValue(wire({ order_status: "rejected", version: 4 }));

    await orderApiHttp.declineOrder(ID, "melebihi limit");

    const [, path, body] = send.mock.calls[0];
    expect(path).toBe(`/orders/${ID}/reject`);
    expect(body).toEqual({ version: 3, reason: "melebihi limit" });
  });
});

describe("approveOrderBatch", () => {
  it("keeps going past one failure and reports it, unlike a single approve", async () => {
    getOne.mockResolvedValue(wire({ version: 1 }));
    send
      .mockResolvedValueOnce(wire({ order_status: "approved" }))
      .mockRejectedValueOnce(new Error("sudah diproses"))
      .mockResolvedValueOnce(wire({ order_status: "approved" }));

    const result = await orderApiHttp.approveOrderBatch(["a", "b", "c"]);

    expect(result.approved).toBe(2);
    expect(result.failures).toEqual(["sudah diproses"]);
  });
});

describe("scheduling", () => {
  it("scheduleOneOrder reads the version and posts the plan link", async () => {
    getOne.mockResolvedValue(wire({ version: 2 }));
    send.mockResolvedValue(undefined);

    await scheduleOneOrder(ID, PLAN_ID);

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe(`/orders/${ID}/schedule`);
    expect(body).toEqual({ version: 2, distribution_order_id: PLAN_ID });
  });

  it("addOrdersToPlan is not atomic: it reports how many succeeded before a failure", async () => {
    getOne.mockResolvedValue(wire({ version: 1 }));
    send
      .mockResolvedValueOnce(undefined) // order 1 schedules fine
      .mockRejectedValueOnce(new Error("Hanya pesanan yang disetujui dapat dijadwalkan")); // order 2 fails

    await expect(orderApiHttp.addOrdersToPlan(PLAN_ID, ["a", "b", "c"])).rejects.toThrow(
      /1 dari 3 pesanan terjadwalkan sebelum gagal/,
    );
    // The loop must stop at the first failure rather than trying the third id.
    expect(send).toHaveBeenCalledTimes(2);
  });

  it("returns the full count when every order schedules", async () => {
    getOne.mockResolvedValue(wire({ version: 1 }));
    send.mockResolvedValue(undefined);

    await expect(orderApiHttp.addOrdersToPlan(PLAN_ID, ["a", "b"])).resolves.toBe(2);
  });
});

describe("createOrder", () => {
  it("uses the supplied lines when given", async () => {
    send.mockResolvedValue(wire());
    await orderApiHttp.createOrder({
      outletId: OUTLET_ID,
      jumlahUnit: 10,
      tanggalDiminta: "2026-09-12",
      lines: [{ productId: PRODUCT_ID, jumlah: 10 }],
    });

    const [, path, body] = send.mock.calls[0];
    expect(path).toBe("/orders");
    expect(body.items).toEqual([{ product_id: PRODUCT_ID, requested_qty: 10 }]);
    expect(getList).not.toHaveBeenCalled();
  });

  it("falls back to the catalogue's first active product with no lines given", async () => {
    getList.mockResolvedValue({ items: [{ id: PRODUCT_ID }] });
    send.mockResolvedValue(wire());

    await orderApiHttp.createOrder({
      outletId: OUTLET_ID,
      jumlahUnit: 10,
      tanggalDiminta: "2026-09-12",
    });

    const [, , body] = send.mock.calls[0];
    expect(body.items).toEqual([{ product_id: PRODUCT_ID, requested_qty: 10 }]);
  });

  it("refuses a zero quantity before making any request", async () => {
    await expect(
      orderApiHttp.createOrder({ outletId: OUTLET_ID, jumlahUnit: 0, tanggalDiminta: "2026-09-12" }),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });
});

describe("getSchedulablePlans", () => {
  it("keeps only draft plans on or after today", async () => {
    getList.mockResolvedValue({
      items: [
        { id: "1", order_number: "RD-1", planned_delivery_date: "2000-01-01", order_status: "draft" },
        { id: "2", order_number: "RD-2", planned_delivery_date: "2999-01-01", order_status: "confirmed" },
        { id: "3", order_number: "RD-3", planned_delivery_date: "2999-01-01", order_status: "draft" },
      ],
    });

    const plans = await orderApiHttp.getSchedulablePlans();

    expect(plans).toEqual([{ id: "3", kode: "RD-3", tanggal: "2999-01-01" }]);
  });
});
