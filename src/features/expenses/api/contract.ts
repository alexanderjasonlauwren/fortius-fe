/**
 * A category's `core.expenses.category` value -- a composite FK into the
 * tenant's own `core.expense_categories.code`, not a fixed CHECK list, so
 * this is a plain string. See `@/features/expensecategories/api`.
 */
export type ExpenseCategory = string;
export type ExpenseStatus = "pending" | "approved" | "rejected" | "cancelled" | "void";
export type PaymentMode = "cash" | "bank";

export const EXPENSE_STATUS_LABEL: Record<ExpenseStatus, string> = {
  pending: "Menunggu persetujuan",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Ditarik",
  void: "Batal",
};

/** One cost on the nota (accounting parity P3). */
export interface ExpenseLineView {
  category: ExpenseCategory;
  categoryName?: string;
  description?: string;
  amount: number;
}

export interface ExpenseView {
  id: string;
  expenseNumber: string;
  /** The first line's category -- what grouping by category reads. */
  category: ExpenseCategory;
  amount: number;
  lines: ExpenseLineView[];
  paymentMode: PaymentMode;
  incurredBy: string;
  incurredAt: string;
  description?: string;
  supplierId?: string;
  supplierName?: string;
  payeeName?: string;
  receiptNumber?: string;
  ocrExtractionId?: string;
  approvalStatus: ExpenseStatus;
  approvedBy?: string;
  secondApprovedBy?: string;
  approvedAt?: string;
  rejectionReason?: string;
  voidReason?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ExpenseFilters {
  search?: string;
  category?: ExpenseCategory | "Semua";
  approvalStatus?: ExpenseStatus | "Semua";
  from?: string;
  to?: string;
}

export interface ExpenseLineInput {
  category: ExpenseCategory;
  description?: string;
  amount: number;
}

export interface CreateExpenseInput {
  lines: ExpenseLineInput[];
  paymentMode: PaymentMode;
  /** The agent's account (or petty-cash drawer) it was paid from. */
  bankAccountId?: string;
  incurredAt: string;
  description?: string;
  supplierId?: string;
  payeeName?: string;
  receiptNumber?: string;
  incurredBy?: string;
  branchId?: string;
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
  getExpense(id: string): Promise<ExpenseView>;
  createExpense(input: CreateExpenseInput): Promise<ExpenseView>;
  /** Edits a pending expense; its lines are replaced. */
  updateExpense(id: string, version: number, input: CreateExpenseInput): Promise<ExpenseView>;
  /** Withdraws a pending expense; nothing was posted. */
  cancelExpense(id: string, version: number, reason?: string): Promise<ExpenseView>;
  approveExpense(input: ExpenseDecisionInput): Promise<ExpenseView>;
  rejectExpense(input: ExpenseDecisionInput): Promise<ExpenseView>;
}
