import { describe, expect, it, vi } from "vitest";
const api = vi.hoisted(() => ({ getOne: vi.fn(), send: vi.fn() }));
vi.mock("@/lib/api", () => api);
import { sim3lonAdjustmentHttp } from "./sim3lonAdjustment.http";
import { adjustmentAction } from "./sim3lonAdjustment.contract";

const wire = {
  plan_id: "plan", plan_number: "RD-1", plan_status: "confirmed", operational_date: "2026-11-23", state: "adjustable",
  sim3lon_qty: 360, committed_qty: 210, add_qty: 150, reduce_qty: 0, over_qty: 0, fingerprint: "a".repeat(64),
  rows: [{ outlet_id: "o", outlet_code: "4507", outlet_name: "SRI KANAH", sim3lon_qty: 120, committed_qty: 60, sent_qty: 60, add_qty: 60, reduce_qty: 0, over_qty: 0 }],
  draft_topup: { id: "t", order_number: "RD-2", order_status: "draft" },
};

describe("SIM3LON adjustment API", () => {
  it("reads the comparison and posts back only the fingerprint the manager saw", async () => {
    api.getOne.mockResolvedValue(wire);
    const view = await sim3lonAdjustmentHttp.getAdjustment("plan");
    expect(api.getOne).toHaveBeenCalledWith("/distribution/orders/plan/sim3lon-adjustment");
    expect(view).toMatchObject({ add: 150, committed: 210, draftTopup: { id: "t", kode: "RD-2" },
      rows: [{ outletName: "SRI KANAH", sent: 60, add: 60 }] });

    api.send.mockResolvedValue({ ...wire, state: "in_sync", add_qty: 0, rows: [], topup: { id: "t", order_number: "RD-2" } });
    const after = await sim3lonAdjustmentHttp.applyAdjustment("plan", view.fingerprint);
    expect(api.send).toHaveBeenCalledWith("post", "/distribution/orders/plan/sim3lon-adjustment", { fingerprint: "a".repeat(64) });
    expect(after.topup).toEqual({ id: "t", kode: "RD-2", status: undefined, totalUnit: undefined });
  });

  it("refuses a comparison it cannot read rather than offering a button", async () => {
    for (const bad of [{ ...wire, state: "weird" }, { ...wire, fingerprint: "short" }, { ...wire, rows: null }]) {
      api.getOne.mockResolvedValue(bad);
      await expect(sim3lonAdjustmentHttp.getAdjustment("plan")).rejects.toThrow();
    }
  });

  it("names the action by what it does", () => {
    const base = { add: 0, reduce: 0 } as Parameters<typeof adjustmentAction>[0];
    expect(adjustmentAction({ ...base, add: 5 })).toBe("Tambah dari SIM3LON");
    expect(adjustmentAction({ ...base, reduce: 5 })).toBe("Sesuaikan dengan SIM3LON");
    expect(adjustmentAction({ ...base, add: 5, reduce: 5 })).toBe("Sesuaikan dengan SIM3LON");
  });
});
