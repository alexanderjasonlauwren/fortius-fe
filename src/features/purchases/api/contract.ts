/**
 * What every purchase adapter must provide.
 *
 * A purchase is a vendor bill (accounting parity P3): stock or account
 * lines, a due date and the vendor's own bill number, paid in one or more
 * instalments, each voidable. The SA-redeemed ("tebus") path
 * (`RecordPurchase`) has no form here -- it is raised from the agreement --
 * but its bills list, pay and print here like any other;
 * `scheduleAgreementId` set is what tells them apart.
 */

/** A line is stock (product) or an account line (an expense or asset
 *  account with a description -- a repair, a uniform order). */
export interface PurchaseLineView {
  kind: "product" | "account";
  productId?: string;
  productName?: string;
  accountId?: string;
  accountCode?: string;
  accountName?: string;
  description?: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export type PurchasePaymentStatus = "unpaid" | "partial" | "paid" | "void";

export interface PurchasePaymentView {
  id: string;
  number: string;
  paidOn: string;
  amount: number;
  bankAccountId?: string;
  bankReference?: string;
  notes?: string;
  status: "posted" | "void";
  voidReason?: string;
  version: number;
}

export interface PurchaseView {
  id: string;
  purchaseNumber: string;
  scheduleAgreementId?: string;
  supplierId?: string;
  supplierCode?: string;
  supplierName?: string;
  vendorInvoiceNumber?: string;
  lines: PurchaseLineView[];
  redeemedAt: string;
  dueDate: string;
  subtotal: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
  amountPaid: number;
  outstanding: number;
  totalQty: number;
  paymentStatus: PurchasePaymentStatus;
  paidAt?: string;
  bankReference?: string;
  notes?: string;
  voidReason?: string;
  /** Only on a single bill's read. */
  payments: PurchasePaymentView[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseFilters {
  /** "open" is unpaid or partial -- what is still owed. */
  paymentStatus?: PurchasePaymentStatus | "open" | "Semua";
  supplierId?: string;
  search?: string;
  from?: string;
  to?: string;
}

export interface GeneralPurchaseLineInput {
  /** Exactly one of productId and accountId. */
  productId?: string;
  accountId?: string;
  description?: string;
  quantity: number;
  unitCost: number;
}

export interface RecordGeneralPurchaseInput {
  supplierId: string;
  date: string;
  /** Omitted: payable on the bill's date. */
  dueDate?: string;
  vendorInvoiceNumber?: string;
  /** The branch in scope; omitted resolves the tenant's default. */
  branchId?: string;
  lines: GeneralPurchaseLineInput[];
  notes?: string;
}

export interface RecordPurchasePaymentInput {
  purchaseId: string;
  amount: number;
  paidOn: string;
  bankAccountId?: string;
  bankReference?: string;
  notes?: string;
}

export interface PayPurchaseInput {
  id: string;
  version: number;
  bankReference?: string;
  bankAccountId?: string;
}

export interface PurchaseApi {
  getPurchases(filters?: PurchaseFilters): Promise<PurchaseView[]>;
  getPurchase(id: string): Promise<PurchaseView>;
  recordGeneralPurchase(input: RecordGeneralPurchaseInput): Promise<PurchaseView>;
  /** Pays part or all of one bill. */
  recordPurchasePayment(input: RecordPurchasePaymentInput): Promise<PurchaseView>;
  payPurchase(input: PayPurchaseInput): Promise<PurchaseView>;
}
