import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping between the console's OutletWarningEntity and
 * the backend's own outletwarning.WarningResponse, following
 * transportationApi.test.ts's own pattern -- the closest, most recently
 * added sibling.
 */

const getList = vi.fn();
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
  getOne: vi.fn(),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { outletWarningApiHttp } = await import("./outletWarningApi.http");

function warningWire(overrides: Record<string, unknown> = {}) {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    outlet_id: "22222222-2222-4222-8222-222222222222",
    issued_on: "2026-09-01",
    reason: "Keterlambatan pembayaran berulang",
    created_at: "2026-09-01T00:00:00+07:00",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  send.mockReset();
});

describe("getOutletWarnings", () => {
  it("maps the wire shape onto the console's own field names", async () => {
    getList.mockResolvedValue({
      items: [warningWire({ notes: "Dikonfirmasi via telepon" })],
    });

    const [w] = await outletWarningApiHttp.getOutletWarnings("22222222-2222-4222-8222-222222222222");

    expect(w.outletId).toBe("22222222-2222-4222-8222-222222222222");
    expect(w.issuedOn).toBe("2026-09-01");
    expect(w.reason).toBe("Keterlambatan pembayaran berulang");
    expect(w.notes).toBe("Dikonfirmasi via telepon");
  });

  it("reads an absent note as undefined, not fabricated", async () => {
    getList.mockResolvedValue({ items: [warningWire()] });
    const [w] = await outletWarningApiHttp.getOutletWarnings("22222222-2222-4222-8222-222222222222");
    expect(w.notes).toBeUndefined();
  });

  it("filters by outlet_id on the server", async () => {
    getList.mockResolvedValue({ items: [] });
    await outletWarningApiHttp.getOutletWarnings("22222222-2222-4222-8222-222222222222");

    const [, params] = getList.mock.calls[0];
    expect(params.filters).toEqual([
      { field: "outlet_id", operator: "eq", value: "22222222-2222-4222-8222-222222222222" },
    ]);
  });
});

describe("createOutletWarning", () => {
  it("sends the wire field names", async () => {
    send.mockResolvedValue(warningWire());
    await outletWarningApiHttp.createOutletWarning({
      outletId: "22222222-2222-4222-8222-222222222222",
      issuedOn: "2026-09-01",
      reason: "Keterlambatan pembayaran berulang",
      notes: "Dikonfirmasi via telepon",
    });

    expect(send).toHaveBeenCalledWith("post", "/outlet-warnings", {
      outlet_id: "22222222-2222-4222-8222-222222222222",
      issued_on: "2026-09-01",
      reason: "Keterlambatan pembayaran berulang",
      notes: "Dikonfirmasi via telepon",
    });
  });
});
