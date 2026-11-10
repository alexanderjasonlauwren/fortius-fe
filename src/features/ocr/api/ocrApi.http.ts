import { apiClient, getAllPages, getOne, send, upload } from "@/lib/api";
import type { ExpenseCategory } from "@/features/expenses/api/contract";
import type {
  Confidence, DocumentType, OcrApi, ProcessStatus, ReceiptCorrections, ReceiptExtraction, ReceiptStatus,
  ReviewReceiptInput, ReviewReceiptResult, UploadReceiptInput,
} from "./contract";

interface ExtractionResponse {
  id: string;
  merchant_name?: string;
  txn_date?: string;
  total_amount?: number;
  created_at: string;
  file_name?: string;
  has_file?: boolean;
  last_status?: Exclude<ReceiptStatus, "pending">;
  last_note?: string;
  expense_id?: string;
  expense_number?: string;
  process_status?: ProcessStatus;
  process_error?: string;
  engine?: string;
  document_type?: DocumentType;
  subtotal?: number;
  tax_amount?: number;
  reference_no?: string;
  payment_method?: string;
  needs_review?: boolean;
  review_reasons?: string[];
  confidence?: Record<string, Confidence>;
  evidence?: Record<string, string>;
  suggested_category?: string;
  suggested_expense_category?: string;
  duplicate_of?: string;
}

interface ArchiveResponse {
  id: string;
  extraction_id: string;
  category: ExpenseCategory;
  archived_at: string;
}

interface VerificationResponse {
  extraction_id: string;
  archive_id?: string;
  expense_id?: string;
  expense_error?: string;
}

function toReceipt(row: ExtractionResponse, category?: ExpenseCategory): ReceiptExtraction {
  return {
    id: row.id,
    fileName: row.file_name,
    hasFile: !!row.has_file,
    merchantName: row.merchant_name,
    txnDate: row.txn_date,
    totalAmount: row.total_amount,
    createdAt: row.created_at,
    status: row.last_status ?? "pending",
    note: row.last_note,
    category,
    expenseId: row.expense_id,
    expenseNumber: row.expense_number,
    // A server without the engine field predates it: everything was typed.
    processStatus: row.process_status ?? "ready",
    processError: row.process_error,
    engine: row.engine,
    documentType: row.document_type,
    subtotal: row.subtotal,
    taxAmount: row.tax_amount,
    referenceNo: row.reference_no,
    paymentMethod: row.payment_method,
    needsReview: row.needs_review,
    reviewReasons: row.review_reasons ?? [],
    confidence: row.confidence ?? {},
    evidence: row.evidence ?? {},
    suggestedCategory: row.suggested_category,
    suggestedExpenseCategory: row.suggested_expense_category,
    duplicateOf: row.duplicate_of,
  };
}

function toCorrections(c?: ReceiptCorrections) {
  if (!c) return undefined;
  const body = {
    merchant_name: c.merchantName,
    txn_date: c.txnDate,
    total_amount: c.totalAmount,
    reference_no: c.referenceNo,
  };
  return Object.values(body).some((v) => v !== undefined) ? body : undefined;
}

async function getReceipts(search?: string): Promise<ReceiptExtraction[]> {
  const [extractions, archive] = await Promise.all([
    // Whole lists: the queue filters by review status here, which the server
    // cannot, and receipts arrive a few a day. Reading the newest 100 hid an
    // older receipt still waiting for review (fixed 2026-11-02).
    getAllPages<ExtractionResponse>("/ocr/extractions", {
      search: search?.trim() || undefined, sort: [{ field: "created_at", direction: "desc" }],
    }),
    getAllPages<ArchiveResponse>("/ocr/archive", { sort: [{ field: "archived_at", direction: "desc" }] }),
  ]);
  const categoryOf = new Map(archive.items.map((row) => [row.extraction_id, row.category]));
  return extractions.items.map((row) => toReceipt(row, categoryOf.get(row.id)));
}

/** Values are read by the engine, or typed while reviewing; never at upload. */
async function uploadReceipt(input: UploadReceiptInput): Promise<ReceiptExtraction> {
  const fields: Record<string, string> = {};
  if (input.documentType && input.documentType !== "auto") fields.document_type = input.documentType;
  const row = await upload<ExtractionResponse>("/ocr/inbox/upload", input.file, "file", undefined, fields);
  return toReceipt(row);
}

async function reviewReceipt(input: ReviewReceiptInput): Promise<ReviewReceiptResult> {
  const approving = input.outcome === "approved";
  const result = await send<VerificationResponse>("post", `/ocr/extractions/${input.id}/verify`, {
    verification_status: input.outcome,
    note: input.note?.trim() || undefined,
    corrections: toCorrections(input.corrections),
    category: approving ? input.category : undefined,
    create_expense: approving && input.expense ? {
      payment_mode: input.expense.paymentMode,
      bank_account_id: input.expense.bankAccountId || undefined,
      incurred_at: input.expense.incurredAt,
      description: input.expense.description || undefined,
    } : undefined,
  });
  return {
    extractionId: result.extraction_id,
    archiveId: result.archive_id,
    expenseId: result.expense_id,
    expenseError: result.expense_error,
  };
}

/** Resolved against the API's origin, as attachment links are. */
async function receiptFileUrl(id: string): Promise<string> {
  const { url } = await getOne<{ url: string }>(`/ocr/extractions/${id}/file`);
  return new URL(url, apiClient.defaults.baseURL).href;
}

export const ocrApiHttp: OcrApi = { getReceipts, uploadReceipt, reviewReceipt, receiptFileUrl };
