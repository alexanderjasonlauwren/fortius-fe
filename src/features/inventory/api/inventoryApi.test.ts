import { beforeEach, describe, expect, it, vi } from "vitest";

const getOne = vi.fn();
const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
}));

const { inventoryApiHttp: api } = await import("./inventoryApi.http");
const { accountingPeriodApiHttp: periods } = await import("@/features/accountingperiods/api/accountingPeriodApi.http");
const { reportLinkHref } = await import("@/features/financereports/lib/links");

beforeEach(() => { getOne.mockReset(); send.mockReset(); });

describe("inventory adapter (parity P7)", () => {
  it("reads stock with its moving average", async () => {
    getOne.mockResolvedValue([{ product_id: "p1", code: "LPG-3KG", name: "LPG", kind: "commodity", quantity: 118, amount: 1897833.33, average: 16083.33, last_movement: "2026-10-15T00:00:00Z", opened: true }]);
    const [row] = await api.getStock();
    expect(getOne).toHaveBeenCalledWith("/inventory/stock");
    expect(row).toMatchObject({ productId: "p1", quantity: 118, average: 16083.33, lastMovement: "2026-10-15", opened: true });
  });

  it("sends a stock count in the server's words, and reads its difference back", async () => {
    send.mockResolvedValue({ id: "c1", number: "SO-1", date: "2026-10-15", total_amount: -200, lines: [
      { product_id: "p1", code: "X", name: "X", system_quantity: 10, counted_quantity: 8, difference: -2, unit_cost: 100, amount: -200 },
    ] });
    const count = await api.createStockCount({ date: "2026-10-15", notes: "", lines: [{ productId: "p1", countedQuantity: 8 }] });
    expect(send).toHaveBeenCalledWith("post", "/inventory/stock-counts", {
      date: "2026-10-15", notes: undefined, lines: [{ product_id: "p1", counted_quantity: 8 }],
    });
    expect(count.lines[0]).toMatchObject({ systemQuantity: 10, difference: -2, amount: -200 });
  });

  it("records opening stock with quantity and unit cost", async () => {
    send.mockResolvedValue([]);
    await api.recordOpening({ date: "2026-10-01", lines: [{ productId: "p1", quantity: 100, unitCost: 16000 }] });
    expect(send).toHaveBeenCalledWith("post", "/inventory/opening", {
      date: "2026-10-01", lines: [{ product_id: "p1", quantity: 100, unit_cost: 16000 }],
    });
  });

  it("opens a product's kartu stok from a report row", () => {
    expect(reportLinkHref({ type: "product", id: "p1" })).toBe("/laporan/stock_card?product_id=p1");
  });
});

describe("accounting period adapter (parity P7)", () => {
  it("lists a year's months", async () => {
    getOne.mockResolvedValue([{ period: "2026-09", status: "closed", year_closed: false, journals: 4, version: 2, changed_by: "Admin" }]);
    const [m] = await periods.listYear(2026);
    expect(getOne).toHaveBeenCalledWith("/accounting-periods?year=2026");
    expect(m).toMatchObject({ period: "2026-09", status: "closed", yearClosed: false, journals: 4, version: 2, changedBy: "Admin" });
  });

  it("moves a month with the version read, and a reason only when given", async () => {
    send.mockResolvedValue({ period: "2026-09", status: "review", year_closed: false, journals: 0, version: 1 });
    await periods.setStatus("2026-09", { status: "review", version: 0 });
    expect(send).toHaveBeenLastCalledWith("put", "/accounting-periods/2026-09", { status: "review", version: 0 });
    await periods.setStatus("2026-09", { status: "open", version: 3, reason: "koreksi" });
    expect(send).toHaveBeenLastCalledWith("put", "/accounting-periods/2026-09", { status: "open", version: 3, reason: "koreksi" });
  });
});
