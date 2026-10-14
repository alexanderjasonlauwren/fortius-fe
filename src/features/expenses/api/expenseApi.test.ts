import { beforeEach, describe, expect, it, vi } from "vitest";

const getList = vi.fn();
const send = vi.fn();
vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: vi.fn(),
  send: (...args: unknown[]) => send(...args),
}));

const { expenseApiHttp } = await import("./expenseApi.http");

const wire = {
  id: "11111111-1111-4111-8111-111111111111",
  expense_number: "EXP-SLT-202609-0001",
  category: "fuel",
  amount: 125000,
  payment_mode: "cash",
  incurred_by: "Driver Satu",
  incurred_at: "2026-09-13",
  approval_status: "pending",
  version: 1,
  created_at: "2026-09-13T01:00:00Z",
  updated_at: "2026-09-13T01:00:00Z",
};

beforeEach(() => { getList.mockReset(); send.mockReset(); });

describe("expenseApiHttp", () => {
  it("maps expense wire fields and sends exact list filters", async () => {
    getList.mockResolvedValue({ items: [wire] });
    const [row] = await expenseApiHttp.getExpenses({ category: "fuel", approvalStatus: "pending" });
    expect(row.expenseNumber).toBe("EXP-SLT-202609-0001");
    expect(row.incurredBy).toBe("Driver Satu");
    expect(getList.mock.calls[0][1].filters).toEqual([
      { field: "category", operator: "eq", value: "fuel" },
      { field: "approval_status", operator: "eq", value: "pending" },
    ]);
  });

  it("sends the create and dual-control approval payloads", async () => {
    send.mockResolvedValue(wire);
    await expenseApiHttp.createExpense({
      lines: [{ category: "fuel", amount: 100000, description: " Solar " }, { category: "toll", amount: 25000 }],
      paymentMode: "cash", bankAccountId: "kas-1", incurredAt: "2026-09-13",
      payeeName: " SPBU 44.507 ", receiptNumber: "NT-9",
    });
    expect(send).toHaveBeenCalledWith("post", "/expenses", expect.objectContaining({
      lines: [{ category: "fuel", amount: 100000, description: "Solar" }, { category: "toll", amount: 25000, description: undefined }],
      payment_mode: "cash", bank_account_id: "kas-1", payee_name: "SPBU 44.507", receipt_number: "NT-9",
    }));

    await expenseApiHttp.approveExpense({ id: wire.id, version: 1, secondApproverId: "22222222-2222-4222-8222-222222222222" });
    expect(send).toHaveBeenLastCalledWith("post", `/expenses/${wire.id}/approve`, {
      version: 1,
      second_approver_id: "22222222-2222-4222-8222-222222222222",
    });
  });
});

describe("expense corrections", () => {
  it("reads lines, payee and void reason", async () => {
    getList.mockResolvedValue({ items: [{ ...wire, approval_status: "void", void_reason: "nota ganda", payee_name: "Bengkel",
      lines: [{ category: "fuel", category_name: "BBM", amount: 125000 }] }] });
    const [row] = await expenseApiHttp.getExpenses({ from: "2026-09-01", to: "2026-09-30" });
    expect(row).toMatchObject({ approvalStatus: "void", voidReason: "nota ganda", payeeName: "Bengkel" });
    expect(row.lines[0]).toEqual({ category: "fuel", categoryName: "BBM", description: undefined, amount: 125000 });
    expect(getList.mock.calls[0][1].filters).toEqual([
      { field: "date", operator: "gte", value: "2026-09-01" },
      { field: "date", operator: "lte", value: "2026-09-30" },
    ]);
  });

  it("edits, withdraws and voids under the version read", async () => {
    send.mockResolvedValue(wire);
    await expenseApiHttp.updateExpense(wire.id, 2, { lines: [{ category: "fuel", amount: 1 }], paymentMode: "bank", incurredAt: "2026-09-13" });
    await expenseApiHttp.cancelExpense(wire.id, 3, "");
    await expenseApiHttp.voidExpense(wire.id, 5, "nota ganda");
    expect(send.mock.calls[0][0]).toBe("put");
    expect(send.mock.calls[0][2]).toMatchObject({ version: 2, payment_mode: "bank", lines: [{ category: "fuel", amount: 1 }] });
    expect(send.mock.calls[1]).toEqual(["post", `/expenses/${wire.id}/cancel`, { version: 3, reason: undefined }]);
    expect(send.mock.calls[2]).toEqual(["post", `/expenses/${wire.id}/void`, { version: 5, reason: "nota ganda" }]);
  });
});
