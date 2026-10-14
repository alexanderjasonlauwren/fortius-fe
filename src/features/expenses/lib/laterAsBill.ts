import type { ExpenseCategoryView } from "@/features/expensecategories/api/contract";
import type { RecordGeneralPurchaseInput } from "@/features/purchases/api/contract";

export type PayMode = "cash" | "bank" | "later";

export interface ExpenseLineRow {
  key: number;
  category: string;
  description: string;
  amount: number;
}

export interface ExpenseFormState {
  incurredAt: string;
  payMode: PayMode;
  bankAccountId: string;
  supplierId: string;
  payeeName: string;
  receiptNumber: string;
  description: string;
  dueDate: string;
  lines: ExpenseLineRow[];
}

/** A "bayar nanti" expense as a vendor bill: each line on its category's
 *  own account, so the cost lands where an approved expense would have
 *  put it, and the debt is a bill to pay from Pembelian. */
export function laterAsBill(
  form: ExpenseFormState, categories: ExpenseCategoryView[], branchId?: string,
): RecordGeneralPurchaseInput {
  const byCode = new Map(categories.map((c) => [c.code, c]));
  return {
    supplierId: form.supplierId,
    date: form.incurredAt,
    dueDate: form.dueDate,
    vendorInvoiceNumber: form.receiptNumber,
    branchId,
    notes: form.description || undefined,
    lines: form.lines.map((l) => ({
      accountId: byCode.get(l.category)?.accountId,
      description: l.description.trim() || byCode.get(l.category)?.name || l.category,
      quantity: 1,
      unitCost: l.amount,
    })),
  };
}
