/**
 * What every purchase adapter must provide.
 *
 * Gap-closing plan, Phase F: only the general-purchase creation path
 * (`RecordGeneralPurchase`, no Schedule Agreement behind it) has a form
 * here -- the SA-redeemed ("tebus") path (`RecordPurchase`) is a separate
 * creation route this console still has no UI for, since it is triggered
 * automatically wherever an agreement's own quota page already lives, not
 * from a purchases list. `getPurchases` still returns both kinds, since
 * `GET /purchases` does -- `scheduleAgreementId` set is what tells them
 * apart on this list.
 */

export interface PurchaseLineView {
  productId: string;
  productCode: string;
  productName: string;
  quantity: number;
  unitCost: number;
  subtotal: number;
}

export type PurchasePaymentStatus = "unpaid" | "paid";

export interface PurchaseView {
  id: string;
  purchaseNumber: string;
  scheduleAgreementId?: string;
  supplierId?: string;
  supplierCode?: string;
  supplierName?: string;
  lines: PurchaseLineView[];
  redeemedAt: string;
  subtotal: number;
  taxPercentage: number;
  taxAmount: number;
  totalAmount: number;
  totalQty: number;
  paymentStatus: PurchasePaymentStatus;
  paidAt?: string;
  bankReference?: string;
  notes?: string;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface PurchaseFilters {
  paymentStatus?: PurchasePaymentStatus | "Semua";
}

export interface GeneralPurchaseLineInput {
  productId: string;
  quantity: number;
  unitCost: number;
}

/**
 * No `branchId` -- this console has no branch picker on any finance
 * dialog yet (`ManualJournalDialog`'s own doc), and `RecordGeneralPurchaseRequest.BranchID`
 * is required server-side, so both adapters resolve the tenant's default
 * branch themselves, the same way `sa/api::saApi.http.ts`'s own
 * `defaultBranchID()` already does for Schedule Agreement imports.
 */
export interface RecordGeneralPurchaseInput {
  supplierId: string;
  date: string;
  lines: GeneralPurchaseLineInput[];
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
  recordGeneralPurchase(input: RecordGeneralPurchaseInput): Promise<PurchaseView>;
  payPurchase(input: PayPurchaseInput): Promise<PurchaseView>;
}
