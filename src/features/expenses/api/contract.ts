/**
 * A category's `core.expenses.category` value -- a composite FK into the
 * tenant's own `core.expense_categories.code` (gap-closing plan, Phase F),
 * not a fixed CHECK list, so this is a plain string, not a closed union.
 * See `@/features/expensecategories/api` for the real category set.
 */
export type ExpenseCategory = string;
export type ExpenseStatus = "pending" | "approved" | "rejected";
export type PaymentMode = "cash" | "bank";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
};

export interface ExpenseView {
  id: string;
  expenseNumber: string;
  category: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode;
  incurredBy: string;
  incurredAt: string;
  description?: string;
  ocrExtractionId?: string;
  approvalStatus: ExpenseStatus;
  approvedBy?: string;
  secondApprovedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseFilters {
  search?: string;
  category?: ExpenseCategory | "Semua";
  approvalStatus?: ExpenseStatus | "Semua";
}

export interface CreateExpenseInput {
  category: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode;
  incurredAt: string;
  description?: string;
  incurredBy?: string;
  ocrExtractionId?: string;
}

export interface ExpenseDecisionInput {
  id: string;
  version: number;
  secondApproverId?: string;
  reason?: string;
}

export interface ExpenseApi {
  getExpenses(filters?: ExpenseFilters): Promise<ExpenseView[]>;
  createExpense(input: CreateExpenseInput): Promise<ExpenseView>;
  approveExpense(input: ExpenseDecisionInput): Promise<ExpenseView>;
  rejectExpense(input: ExpenseDecisionInput): Promise<ExpenseView>;
}
