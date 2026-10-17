import { getList, getOne, send } from "@/lib/api";
import type {
  CreateExpenseInput,
  ExpenseApi,
  ExpenseDecisionInput,
  ExpenseFilters,
  ExpenseView,
} from "./contract";

interface ExpenseResponse {
  id: string;
  expense_number: string;
  category: ExpenseView["category"];
  amount: number;
  lines?: { category: string; category_name?: string; description?: string; amount: number }[];
  payment_mode: ExpenseView["paymentMode"];
  incurred_by: string;
  incurred_at: string;
  description?: string;
  supplier_id?: string;
  supplier_name?: string;
  payee_name?: string;
  receipt_number?: string;
  ocr_extraction_id?: string;
  approval_status: ExpenseView["approvalStatus"];
  approved_by?: string;
  second_approved_by?: string;
  approved_at?: string;
  rejection_reason?: string;
  void_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function toView(row: ExpenseResponse): ExpenseView {
  return {
    id: row.id,
    expenseNumber: row.expense_number,
    category: row.category,
    amount: row.amount,
    lines: (row.lines ?? []).map((l) => ({
      category: l.category, categoryName: l.category_name, description: l.description, amount: l.amount,
    })),
    paymentMode: row.payment_mode,
    incurredBy: row.incurred_by,
    incurredAt: row.incurred_at,
    description: row.description,
    supplierId: row.supplier_id,
    supplierName: row.supplier_name,
    payeeName: row.payee_name,
    receiptNumber: row.receipt_number,
    ocrExtractionId: row.ocr_extraction_id,
    approvalStatus: row.approval_status,
    approvedBy: row.approved_by,
    secondApprovedBy: row.second_approved_by,
    approvedAt: row.approved_at,
    rejectionReason: row.rejection_reason,
    voidReason: row.void_reason,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getExpenses(filters?: ExpenseFilters): Promise<ExpenseView[]> {
  const list = await getList<ExpenseResponse>("/expenses", {
    pageSize: 100,
    search: filters?.search,
    sort: [{ field: "incurred_at", direction: "desc" }],
    filters: [
      ...(filters?.category && filters.category !== "Semua"
        ? [{ field: "category", operator: "eq" as const, value: filters.category }]
        : []),
      ...(filters?.approvalStatus && filters.approvalStatus !== "Semua"
        ? [{ field: "approval_status", operator: "eq" as const, value: filters.approvalStatus }]
        : []),
      ...(filters?.from ? [{ field: "date", operator: "gte" as const, value: filters.from }] : []),
      ...(filters?.to ? [{ field: "date", operator: "lte" as const, value: filters.to }] : []),
    ],
  });
  return list.items.map(toView);
}

async function getExpense(id: string): Promise<ExpenseView> {
  return toView(await getOne<ExpenseResponse>(`/expenses/${id}`));
}

function toWire(input: CreateExpenseInput) {
  return {
    lines: input.lines.map((l) => ({
      category: l.category, description: l.description?.trim() || undefined, amount: l.amount,
    })),
    payment_mode: input.paymentMode,
    bank_account_id: input.bankAccountId || undefined,
    incurred_at: input.incurredAt,
    description: input.description?.trim() || undefined,
    supplier_id: input.supplierId || undefined,
    payee_name: input.payeeName?.trim() || undefined,
    receipt_number: input.receiptNumber?.trim() || undefined,
    incurred_by: input.incurredBy || undefined,
    branch_id: input.branchId || undefined,
    ocr_extraction_id: input.ocrExtractionId || undefined,
  };
}

async function createExpense(input: CreateExpenseInput): Promise<ExpenseView> {
  return toView(await send<ExpenseResponse>("post", "/expenses", toWire(input)));
}

async function updateExpense(id: string, version: number, input: CreateExpenseInput): Promise<ExpenseView> {
  return toView(await send<ExpenseResponse>("put", `/expenses/${id}`, { version, ...toWire(input) }));
}

async function cancelExpense(id: string, version: number, reason?: string): Promise<ExpenseView> {
  return toView(await send<ExpenseResponse>("post", `/expenses/${id}/cancel`, { version, reason: reason || undefined }));
}

async function approveExpense(input: ExpenseDecisionInput): Promise<ExpenseView> {
  return toView(await send<ExpenseResponse>("post", `/expenses/${input.id}/approve`, {
    version: input.version,
    second_approver_id: input.secondApproverId,
  }));
}

async function rejectExpense(input: ExpenseDecisionInput): Promise<ExpenseView> {
  return toView(await send<ExpenseResponse>("post", `/expenses/${input.id}/reject`, {
    version: input.version,
    reason: input.reason,
  }));
}

export const expenseApiHttp: ExpenseApi = {
  getExpenses, getExpense, createExpense, updateExpense, cancelExpense, approveExpense, rejectExpense,
};
