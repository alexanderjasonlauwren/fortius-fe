import { beforeEach, describe, expect, it, vi } from "vitest";

const recordPurchasePayment = vi.fn();
vi.mock("@/features/purchases/api/purchaseApi", () => ({
  recordPurchasePayment: (...args: unknown[]) => recordPurchasePayment(...args),
  getPurchases: vi.fn(),
}));

const { payBillsInTurn } = await import("@/features/purchases/lib/payBills");

beforeEach(() => recordPurchasePayment.mockReset());

describe("paying several bills", () => {
  it("records one payment per bill, each with the shared date, account and reference", async () => {
    recordPurchasePayment.mockResolvedValue({});
    const n = await payBillsInTurn(
      [{ purchaseId: "a", amount: 100 }, { purchaseId: "b", amount: 50 }],
      { paidOn: "2026-10-14", bankAccountId: "ba-1", bankReference: "TRF-7" },
    );
    expect(n).toBe(2);
    expect(recordPurchasePayment.mock.calls.map(([input]) => input)).toEqual([
      { purchaseId: "a", amount: 100, paidOn: "2026-10-14", bankAccountId: "ba-1", bankReference: "TRF-7" },
      { purchaseId: "b", amount: 50, paidOn: "2026-10-14", bankAccountId: "ba-1", bankReference: "TRF-7" },
    ]);
  });

  it("stops at the first refusal and says how many already went through", async () => {
    recordPurchasePayment
      .mockResolvedValueOnce({})
      .mockRejectedValueOnce(new Error("Melebihi sisa tagihan"));
    await expect(
      payBillsInTurn([{ purchaseId: "a", amount: 1 }, { purchaseId: "b", amount: 1 }, { purchaseId: "c", amount: 1 }],
        { paidOn: "2026-10-14" }),
    ).rejects.toThrow("1 tagihan sudah dibayar; berhenti di tagihan berikutnya: Melebihi sisa tagihan");
    expect(recordPurchasePayment).toHaveBeenCalledTimes(2);
  });
});
