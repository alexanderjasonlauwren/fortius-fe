/**
 * Purchases, against the real API.
 *
 * Only the general-purchase creation path has a form -- see contract.ts's
 * own header. `date` is a plain validated "YYYY-MM-DD" string server-side
 * (`RecordGeneralPurchaseRequest.Date`), unlike manual journal's own
 * `journal_date` (a Go `time.Time`) -- no RFC3339 conversion needed here.
 */
import { getList, send } from "@/lib/api";
import type {
  PayPurchaseInput,
  PurchaseApi,
  PurchaseFilters,
  PurchaseView,
  RecordGeneralPurchaseInput,
} from "./contract";

/** Mirrors sa/api::saApi.http.ts's own defaultBranchID() exactly -- this
 *  console has no branch picker yet, and this is the only branch a tenant
 *  with one branch (every demo tenant today) could possibly mean. */
async function defaultBranchID(): Promise<string> {
  const page = await getList<{ id: string; is_default: boolean }>("/branches", { pageSize: 100 });
  const preferred = page.items.find((b) => b.is_default) ?? page.items[0];
  if (!preferred) {
    throw new Error("Tenant ini belum punya cabang, sehingga pembelian tidak dapat dicatat.");
  }
  return preferred.id;
}

interface LineResponse {
  product_id: string;
  quantity: number;
  unit_cost: number;
  subtotal: number;
}

interface PurchaseResponse {
  id: string;
  purchase_number: string;
  schedule_agreement_id?: string;
  supplier_id?: string;
  supplier_code?: string;
  supplier_name?: string;
  // Absent (null) on GET /purchases -- same N+1-avoidance ListJournals and
  // ListRegistrationPackages already follow, caught live posting a general
  // purchase against the real API: `row.lines.map(...)` threw on the very
  // next list read, which React Query swallowed into an empty rows array
  // rather than an error toast (gap-closing plan, Phase F).
  lines: LineResponse[] | null;
  redeemed_at: string;
  subtotal: number;
  tax_percentage: number;
  tax_amount: number;
  total_amount: number;
  total_qty: number;
  payment_status: string;
  paid_at?: string;
  bank_reference?: string;
  notes?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

/** Product code/name are not on the wire line -- resolving them would cost
 *  one request per distinct product on every row of the list. Reads "—"
 *  the same trade InvoiceResponse's own line mapping already makes. */
function toView(row: PurchaseResponse): PurchaseView {
  return {
    id: row.id,
    purchaseNumber: row.purchase_number,
    scheduleAgreementId: row.schedule_agreement_id,
    supplierId: row.supplier_id,
    supplierCode: row.supplier_code,
    supplierName: row.supplier_name,
    lines: (row.lines ?? []).map((l) => ({
      productId: l.product_id,
      productCode: "—",
      productName: "—",
      quantity: l.quantity,
      unitCost: l.unit_cost,
      subtotal: l.subtotal,
    })),
    redeemedAt: row.redeemed_at,
    subtotal: row.subtotal,
    taxPercentage: row.tax_percentage,
    taxAmount: row.tax_amount,
    totalAmount: row.total_amount,
    totalQty: row.total_qty,
    paymentStatus: row.payment_status === "paid" ? "paid" : "unpaid",
    paidAt: row.paid_at,
    bankReference: row.bank_reference,
    notes: row.notes,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getPurchases(filters?: PurchaseFilters): Promise<PurchaseView[]> {
  const page = await getList<PurchaseResponse>("/purchases", {
    pageSize: 100,
    sort: [{ field: "redeemed_at", direction: "desc" }],
    filters:
      filters?.paymentStatus && filters.paymentStatus !== "Semua"
        ? [{ field: "payment_status", operator: "eq" as const, value: filters.paymentStatus }]
        : [],
  });
  return page.items.map(toView);
}

async function recordGeneralPurchase(input: RecordGeneralPurchaseInput): Promise<PurchaseView> {
  const branchId = await defaultBranchID();
  const row = await send<PurchaseResponse>("post", "/purchases/general", {
    supplier_id: input.supplierId,
    branch_id: branchId,
    date: input.date,
    lines: input.lines.map((l) => ({
      product_id: l.productId,
      quantity: l.quantity,
      unit_cost: l.unitCost,
    })),
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

export const purchaseApiHttp: PurchaseApi = { getPurchases, recordGeneralPurchase, payPurchase };
