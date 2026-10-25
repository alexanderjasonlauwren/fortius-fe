import type { ExpenseCategory, PaymentMode } from "@/features/expenses/api/contract";

/** Where a receipt stands: its latest review, or pending before any. */
export type ReceiptStatus = "pending" | "needs_review" | "rejected" | "approved";

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
}

export interface UploadReceiptInput {
  file: File;
  merchantName?: string;
  txnDate?: string;
  totalAmount?: number;
}

export interface ReviewReceiptInput {
  id: string;
  outcome: Exclude<ReceiptStatus, "pending">;
  note?: string;
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
}
