import { apiClient, getList, getOne, send, upload } from "@/lib/api";
import type { ExpenseCategory } from "@/features/expenses/api/contract";
import type { OcrApi, ReceiptExtraction, ReceiptStatus, ReviewReceiptInput, ReviewReceiptResult, UploadReceiptInput } from "./contract";

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
  };
}

async function getReceipts(search?: string): Promise<ReceiptExtraction[]> {
  const [extractions, archive] = await Promise.all([
    getList<ExtractionResponse>("/ocr/extractions", {
      pageSize: 100, search: search?.trim() || undefined, sort: [{ field: "created_at", direction: "desc" }],
    }),
    getList<ArchiveResponse>("/ocr/archive", { pageSize: 100, sort: [{ field: "archived_at", direction: "desc" }] }),
  ]);
  const categoryOf = new Map(archive.items.map((row) => [row.extraction_id, row.category]));
  return extractions.items.map((row) => toReceipt(row, categoryOf.get(row.id)));
}

async function uploadReceipt(input: UploadReceiptInput): Promise<ReceiptExtraction> {
  const fields: Record<string, string> = {};
  if (input.merchantName?.trim()) fields.merchant_name = input.merchantName.trim();
  if (input.txnDate) fields.txn_date = input.txnDate;
  if (input.totalAmount) fields.total_amount = String(input.totalAmount);
  const row = await upload<ExtractionResponse>("/ocr/inbox/upload", input.file, "file", undefined, fields);
  return toReceipt(row);
}

async function reviewReceipt(input: ReviewReceiptInput): Promise<ReviewReceiptResult> {
  const approving = input.outcome === "approved";
  const result = await send<VerificationResponse>("post", `/ocr/extractions/${input.id}/verify`, {
    verification_status: input.outcome,
    note: input.note?.trim() || undefined,
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
