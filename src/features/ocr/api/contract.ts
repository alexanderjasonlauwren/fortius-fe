import type { ExpenseCategory, PaymentMode } from "@/features/expenses/api/contract";

/** Where a receipt stands: its latest review, or pending before any. */
export type ReceiptStatus = "pending" | "needs_review" | "rejected" | "approved";

/**
 * Where the OCR engine is with the file. A receipt typed by hand (a PDF, or
 * no engine on this installation) is ready at once.
 */
export type ProcessStatus = "queued" | "processing" | "ready" | "failed";

/** What the engine found the file to be. */
export type DocumentType = "expense_receipt" | "bank_transfer";

/** What the uploader says it is; auto lets the engine decide. */
export type RequestedDocumentType = "auto" | DocumentType;

export type Confidence = "high" | "medium" | "low";

export interface ReceiptExtraction {
  id: string;
  fileName?: string;
  /** False for receipts recorded by name only, before uploads existed. */
  hasFile: boolean;
  merchantName?: string;
  txnDate?: string;
  totalAmount?: number;
  createdAt: string;
  status: ReceiptStatus;
  /** The latest review's note: why it needs another look, or was rejected. */
  note?: string;
  category?: ExpenseCategory;
  /** The expense filed from this receipt, if one was. */
  expenseId?: string;
  expenseNumber?: string;

  processStatus: ProcessStatus;
  /** Why the engine could not read it, written for a person. */
  processError?: string;
  /** "receipt-engine", or "manual" when a person types the values. */
  engine?: string;
  documentType?: DocumentType;
  subtotal?: number;
  taxAmount?: number;
  /** A transfer's bank reference, as text: it can be 27 digits. */
  referenceNo?: string;
  paymentMethod?: string;
  /** The engine's own verdict; a person verifies every receipt anyway. */
  needsReview?: boolean;
  /** In English: the engine writes them for operators. */
  reviewReasons: string[];
  /** Keyed by the engine's field names: total, subtotal, tax, amount, reference_number. */
  confidence: Partial<Record<string, Confidence>>;
  /** The printed line each value was read from, same keys. */
  evidence: Partial<Record<string, string>>;
  /** The engine's category code (bensin_bbm, parkir, penebusan_pangkalan, ...). */
  suggestedCategory?: string;
  /** The seeded expense category it maps to, when one does. */
  suggestedExpenseCategory?: string;
  /** The earlier upload of the same bank transfer. */
  duplicateOf?: string;
  /** Closed out: under an expense category, or under a payment. */
  archived: boolean;
  /** The payment recorded from this transfer proof. */
  paymentId?: string;
  paymentNumber?: string;
  /** A bank transfer's payer and payee side, as the engine read it. */
  transfer?: TransferDetails;
}

export interface TransferDetails {
  bank?: string;
  senderName?: string;
  senderAccount?: string;
  recipientName?: string;
  /** The ID Pangkalan for an LPG transfer. */
  customerId?: string;
  billerName?: string;
  /** The agency's pangkalan whose code is customerId; absent when none is,
   *  which is also what a transfer paid to another agent looks like. */
  outlet?: { id: string; name: string };
}

export interface UploadReceiptInput {
  file: File;
  documentType?: RequestedDocumentType;
}

/** Values a reviewer fixed; only these are sent. */
export interface ReceiptCorrections {
  merchantName?: string;
  txnDate?: string;
  totalAmount?: number;
  referenceNo?: string;
}

export interface ReviewReceiptInput {
  id: string;
  outcome: Exclude<ReceiptStatus, "pending">;
  note?: string;
  corrections?: ReceiptCorrections;
  /** Required to approve. */
  category?: ExpenseCategory;
  /** Approving may also file an expense, waiting for its own approval. */
  expense?: {
    paymentMode: PaymentMode;
    bankAccountId?: string;
    incurredAt: string;
    description?: string;
  };
}

export interface ReviewReceiptResult {
  extractionId: string;
  archiveId?: string;
  expenseId?: string;
  expenseError?: string;
}

export interface OcrApi {
  getReceipts(search?: string): Promise<ReceiptExtraction[]>;
  uploadReceipt(input: UploadReceiptInput): Promise<ReceiptExtraction>;
  reviewReceipt(input: ReviewReceiptInput): Promise<ReviewReceiptResult>;
  /** A short-lived link to the receipt's file. */
  receiptFileUrl(id: string): Promise<string>;
  /** Bukti transfer, for recording a payment: the cashier's side of the
   *  inbox, under the payment-proof grants. */
  uploadTransferProof(file: File): Promise<ReceiptExtraction>;
  getTransferProof(id: string): Promise<ReceiptExtraction>;
  /** Proofs no payment has been recorded from yet, newest first. */
  getTransferProofs(): Promise<ReceiptExtraction[]>;
  transferProofFileUrl(id: string): Promise<string>;
}
