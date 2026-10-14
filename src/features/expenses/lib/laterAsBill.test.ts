import { describe, expect, it } from "vitest";
import type { ExpenseCategoryView } from "@/features/expensecategories/api/contract";
import { laterAsBill, type ExpenseFormState } from "./laterAsBill";

const category = (code: string, accountId: string, name: string) =>
  ({ code, accountId, name } as ExpenseCategoryView);

describe("an unpaid expense as a vendor bill", () => {
  it("puts each cost on its category's account, carrying the nota and the terms", () => {
    const form: ExpenseFormState = {
      incurredAt: "2026-10-14", payMode: "later", bankAccountId: "", supplierId: "v-1", payeeName: "",
      receiptNumber: "BK-77", description: "Servis truk", dueDate: "2026-10-28",
      lines: [
        { key: 1, category: "maintenance", description: "Ganti oli", amount: 350_000 },
        { key: 2, category: "office", description: " ", amount: 40_000 },
      ],
    };
    const bill = laterAsBill(form, [category("maintenance", "acc-5-3300", "Perawatan"), category("office", "acc-5-4200", "ATK")], "br-1");
    expect(bill).toMatchObject({
      supplierId: "v-1", date: "2026-10-14", dueDate: "2026-10-28", vendorInvoiceNumber: "BK-77", branchId: "br-1",
      notes: "Servis truk",
    });
    expect(bill.lines).toEqual([
      { accountId: "acc-5-3300", description: "Ganti oli", quantity: 1, unitCost: 350_000 },
      // A line with no description of its own reads as its category.
      { accountId: "acc-5-4200", description: "ATK", quantity: 1, unitCost: 40_000 },
    ]);
  });
});
