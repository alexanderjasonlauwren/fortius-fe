import { beforeEach, describe, expect, it, vi } from "vitest";

const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getOne: vi.fn(),
  getPage: vi.fn(),
  send: (...args: unknown[]) => send(...args),
}));

const { saRedemptionApiHttp } = await import("./saRedemptionApi.http");

const wire = {
  id: "r1", redemption_number: "PNB-SLT-202611-0001", sa_number: "3107050",
  transaction_reference: "202611141976389298", paid_on: "2026-11-14T00:00:00Z",
  total_debit: 29656216, total_quantity: 2560, received_quantity: 1640, status: "posted", version: 1,
  deliveries: [{
    id: "d1", line_no: 1, product_id: "p1", product_code: "LPG-3KG", product_name: "LPG 3 Kg",
    delivery_date: "2026-11-16T00:00:00Z", quantity: 560, amount: 6487297, unit_cost: 11584.46,
    delivery_number: "23448709", status: "received",
  }],
  warnings: ["SA 3107050 sudah punya 1 penebusan lain"],
};

describe("saRedemptionApi.http", () => {
  beforeEach(() => send.mockReset());

  it("sends the PDF's header and lines in the wire's shape, blanks left out", async () => {
    send.mockResolvedValue(wire);
    await saRedemptionApiHttp.recordRedemption({
      branchId: "b1", saNumber: " 3107050 ", transactionReference: "202611141976389298", paidOn: "2026-11-14",
      netPrice: 26333412, ppn: 3234590, pph: 88214, totalDebit: 29656216, depot: "  ", notes: "",
      deliveries: [{ productId: "p1", deliveryDate: "2026-11-16", quantity: 560, deliveryNumber: "23448709", description: " " }],
    });
    expect(send).toHaveBeenCalledWith("post", "/sa-redemptions", expect.objectContaining({
      branch_id: "b1", sa_number: "3107050", transaction_reference: "202611141976389298",
      paid_on: "2026-11-14", total_debit: 29656216, depot: undefined, notes: undefined,
      deliveries: [{ product_id: "p1", delivery_date: "2026-11-16", quantity: 560, amount: undefined,
        delivery_number: "23448709", description: undefined }],
    }));
  });

  it("maps a penebusan, dates as days and warnings carried", async () => {
    send.mockResolvedValue(wire);
    const view = await saRedemptionApiHttp.receiveDeliveries("r1");
    expect(send).toHaveBeenCalledWith("post", "/sa-redemptions/r1/receive", {});
    expect(view.paidOn).toBe("2026-11-14");
    expect(view.deliveries[0]).toMatchObject({ deliveryDate: "2026-11-16", amount: 6487297, status: "received" });
    expect(view.warnings).toEqual(["SA 3107050 sudah punya 1 penebusan lain"]);
  });

  it("names the deliveries to receive when asked to", async () => {
    send.mockResolvedValue(wire);
    await saRedemptionApiHttp.receiveDeliveries("r1", ["d1"]);
    expect(send).toHaveBeenCalledWith("post", "/sa-redemptions/r1/receive", { delivery_ids: ["d1"] });
  });
});
