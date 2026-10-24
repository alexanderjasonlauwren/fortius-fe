import { beforeEach, describe, expect, it, vi } from "vitest";

const getOne = vi.fn();
const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
}));
vi.mock("@/lib/scope", () => ({ getActingTenant: () => "tenant-1" }));

const { getSettlementTarget, saveSettlementTarget } = await import("./settingsApi.http");

const own = { unit_term: "tabung", working_days: [1, 2, 3], sim3lon_settlement_target: null };

// Regression 2026-10-24 F3: the settlement target decided how dispatch
// settled an unfunded stop, and nothing showed it or let a tenant set it.
describe("SIM3LON settlement target", () => {
  beforeEach(() => {
    getOne.mockReset().mockResolvedValue({ own, effective: { ...own, sim3lon_settlement_target: null }, inherited_from: {} });
    send.mockReset().mockResolvedValue({});
  });

  it("reads 'bank' when nothing is set, as the server resolves it", async () => {
    expect(await getSettlementTarget()).toEqual({ own: null, effective: "bank" });
  });

  it("saves the choice and sends every other stored field back unchanged", async () => {
    await saveSettlementTarget("customer_deposit");
    expect(send).toHaveBeenCalledWith("put", "/tenants/tenant-1/settings", {
      ...own,
      sim3lon_settlement_target: "customer_deposit",
    });
  });
});
