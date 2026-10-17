/**
 * Purchases (vendor bills), against the real API.
 *
 * Dates are plain validated "YYYY-MM-DD" strings server-side
 * (`RecordGeneralPurchaseRequest.Date`, `RecordPaymentRequest.PaidOn`),
 * unlike manual journal's own `journal_date` (a Go `time.Time`) -- no
 * RFC 3339 conversion needed here.
 */
import { getList, getOne, send } from "@/lib/api";
import type {
  PayPurchaseInput,
  PurchaseApi,
  PurchaseFilters,
  PurchasePaymentStatus,
  PurchaseView,
  RecordGeneralPurchaseInput,
  RecordPurchasePaymentInput,
} from "./contract";

/** The tenant's default branch, for a caller with none in scope. */
async function defaultBranchID(): Promise<string> {
  const page = await getList<{ id: string; is_default: boolean }>("/branches", { pageSize: 100 });
  const preferred = page.items.find((b) => b.is_default) ?? page.items[0];
  if (!preferred) {
    throw new Error("Tenant ini belum punya cabang, sehingga pembelian tidak dapat dicatat.");
  }
  return preferred.id;
}

interface LineResponse {
  product_id?: string;
  product_name?: string;
  account_id?: string;
  account_code?: string;
  account_name?: string;
  description?: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

interface PaymentResponse {
  id: string;
  payment_number: string;
  paid_on: string;
  amount: number;
  bank_account_id?: string;
  bank_reference?: string;
  notes?: string;
  status: "posted" | "void";
  void_reason?: string;
  version: number;
}

interface PurchaseResponse {
  id: string;
  purchase_number: string;
  schedule_agreement_id?: string;
  supplier_id?: string;
  supplier_code?: string;
  supplier_name?: string;
  vendor_invoice_number?: string;
  // Absent (null) on GET /purchases -- lines are read per bill, the same
  // N+1-avoidance ListJournals and ListRegistrationPackages follow.
  lines: LineResponse[] | null;
  payments?: PaymentResponse[];
  redeemed_at: string;
  due_date: string;
  subtotal: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  amount_paid: number;
  outstanding_amount: number;
  total_qty: number;
  payment_status: string;
  paid_at?: string;
  bank_reference?: string;
  notes?: string;
  void_reason?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

const STATUSES: PurchasePaymentStatus[] = ["unpaid", "partial", "paid", "void"];

function toView(row: PurchaseResponse): PurchaseView {
  return {
    id: row.id,
    purchaseNumber: row.purchase_number,
    scheduleAgreementId: row.schedule_agreement_id,
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    vendorInvoiceNumber: row.vendor_invoice_number,
    lines: (row.lines ?? []).map((l) => ({
      kind: l.account_id ? "account" : "product",
      productId: l.product_id,
      productName: l.product_name,
      accountId: l.account_id,
      accountCode: l.account_code,
      accountName: l.account_name,
      description: l.description,
      quantity: l.quantity,
      unitCost: l.unit_cost,
      subtotal: l.subtotal,
    })),
    redeemedAt: row.redeemed_at,
    dueDate: (row.due_date ?? row.redeemed_at).slice(0, 10),
    subtotal: row.subtotal,
    taxPercentage: row.tax_percentage,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    amountPaid: row.amount_paid ?? 0,
    outstanding: row.outstanding_amount ?? row.total_amount,
    totalQty: row.total_qty,
    paymentStatus: STATUSES.includes(row.payment_status as PurchasePaymentStatus)
      ? (row.payment_status as PurchasePaymentStatus)
      : "unpaid",
    paidAt: row.paid_at,
    bankReference: row.bank_reference,
    notes: row.notes,
    voidReason: row.void_reason,
    payments: (row.payments ?? []).map((p) => ({
      id: p.id,
      number: p.payment_number,
      paidOn: p.paid_on.slice(0, 10),
      amount: p.amount,
      bankAccountId: p.bank_account_id,
      bankReference: p.bank_reference,
      notes: p.notes,
      status: p.status,
      voidReason: p.void_reason,
      version: p.version,
    })),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPurchases(filters?: PurchaseFilters): Promise<PurchaseView[]> {
  const wire: { field: string; operator: "eq" | "gte" | "lte"; value: string }[] = [];
  const status = filters?.paymentStatus;
  if (status && status !== "Semua" && status !== "open") {
    wire.push({ field: "payment_status", operator: "eq", value: status });
  }
  if (filters?.supplierId) wire.push({ field: "supplier_id", operator: "eq", value: filters.supplierId });
  if (filters?.from) wire.push({ field: "redeemed_at", operator: "gte", value: filters.from });
  if (filters?.to) wire.push({ field: "redeemed_at", operator: "lte", value: filters.to });
  const page = await getList<PurchaseResponse>("/purchases", {
    pageSize: 100,
    sort: [{ field: "redeemed_at", direction: "desc" }],
    search: filters?.search || undefined,
    filters: wire,
  });
  const rows = page.items.map(toView);
  // "open" is two statuses; the list filters only by one, so the second
  // half of the question is answered here.
  return status === "open" ? rows.filter((r) => r.paymentStatus === "unpaid" || r.paymentStatus === "partial") : rows;
}

async function getPurchase(id: string): Promise<PurchaseView> {
  return toView(await getOne<PurchaseResponse>(`/purchases/${id}`));
}

async function recordGeneralPurchase(input: RecordGeneralPurchaseInput): Promise<PurchaseView> {
  const branchId = input.branchId || (await defaultBranchID());
  const row = await send<PurchaseResponse>("post", "/purchases/general", {
    supplier_id: input.supplierId,
    branch_id: branchId,
    date: input.date,
    due_date: input.dueDate || undefined,
    vendor_invoice_number: input.vendorInvoiceNumber?.trim() || undefined,
    lines: input.lines.map((l) => ({
      product_id: l.productId || undefined,
      account_id: l.accountId || undefined,
      description: l.accountId ? l.description : undefined,
      quantity: l.quantity,
      unit_cost: l.unitCost,
    })),
    notes: input.notes || undefined,
  });
  return toView(row);
}

async function recordPurchasePayment(input: RecordPurchasePaymentInput): Promise<PurchaseView> {
  const row = await send<PurchaseResponse>("post", `/purchases/${input.purchaseId}/payments`, {
    amount: input.amount,
    paid_on: input.paidOn,
    bank_account_id: input.bankAccountId || undefined,
    bank_reference: input.bankReference?.trim() || undefined,
    notes: input.notes || undefined,
  });
  return toView(row);
}

async function payPurchase(input: PayPurchaseInput): Promise<PurchaseView> {
  const row = await send<PurchaseResponse>("post", `/purchases/${input.id}/pay`, {
    version: input.version,
    bank_reference: input.bankReference || undefined,
    bank_account_id: input.bankAccountId || undefined,
  });
  return toView(row);
}

export const purchaseApiHttp: PurchaseApi = {
  getPurchases, getPurchase, recordGeneralPurchase, recordPurchasePayment,
  payPurchase,
};
