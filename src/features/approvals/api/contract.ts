/**
 * Approvals (client answer 5, 2026-10-18): a void needs a reason, evidence
 * and a second person's approval before anything is reversed, and an
 * overpaid receipt -- the same transfer twice -- is paid back only after the
 * same approval. Mirrors fortius-backend's voidrequest and paymentrefund
 * entities.
 */

export type VoidDocumentType =
  | "invoice"
  | "purchase"
  | "purchase_payment"
  | "expense"
  | "cash_voucher"
  | "depreciation_run"
  | "payment"
  | "credit_note";

export type RequestStatus = "pending" | "approved" | "rejected" | "cancelled";

export const DOCUMENT_TYPE_LABEL: Record<VoidDocumentType, string> = {
  invoice: "Tagihan",
  purchase: "Tagihan vendor",
  purchase_payment: "Pembayaran vendor",
  expense: "Pengeluaran",
  cash_voucher: "Voucher kas & bank",
  depreciation_run: "Penyusutan",
  payment: "Penerimaan",
  credit_note: "Nota kredit",
};

export const STATUS_LABEL: Record<RequestStatus, string> = {
  pending: "Menunggu",
  approved: "Disetujui",
  rejected: "Ditolak",
  cancelled: "Ditarik",
};

/** Shared by a void request and a refund: who asked, who decided. */
export interface Decision {
  status: RequestStatus;
  requestedBy?: string;
  requestedAt: string;
  requestedByMe: boolean;
  decidedBy?: string;
  decidedAt?: string;
  decisionNote?: string;
  evidenceCount: number;
  version: number;
}

export interface VoidRequest extends Decision {
  id: string;
  documentType: VoidDocumentType;
  documentId: string;
  parentId?: string;
  documentNumber: string;
  reason: string;
}

export interface NewVoidRequest {
  documentType: VoidDocumentType;
  documentId: string;
  /** The bill a purchase payment belongs to. */
  parentId?: string;
  /** The document's version as read: what the approver approves. */
  version: number;
  reason: string;
}

export interface Refund extends Decision {
  id: string;
  refundNumber: string;
  refundDate: string;
  amount: number;
  paymentId: string;
  paymentNumber: string;
  outletName: string;
  bankAccountId?: string;
  bankAccountName?: string;
  reason: string;
}

export interface NewRefund {
  paymentId: string;
  amount: number;
  refundDate: string;
  bankAccountId?: string;
  reason: string;
}

export interface DecisionInput {
  version: number;
  note?: string;
}

export interface ApprovalsApi {
  listVoidRequests(filter?: { status?: RequestStatus; documentId?: string }): Promise<VoidRequest[]>;
  requestVoid(input: NewVoidRequest): Promise<VoidRequest>;
  decideVoid(id: string, action: "approve" | "reject" | "cancel", input: DecisionInput): Promise<VoidRequest>;
  listRefunds(filter?: { status?: RequestStatus; paymentId?: string }): Promise<Refund[]>;
  requestRefund(input: NewRefund): Promise<Refund>;
  decideRefund(id: string, action: "approve" | "reject" | "cancel", input: DecisionInput): Promise<Refund>;
}
