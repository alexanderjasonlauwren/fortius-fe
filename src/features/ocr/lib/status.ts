import type { StatusVariant } from "@/lib/status";
import type { Confidence, ProcessStatus, ReceiptExtraction, ReceiptStatus } from "../api/contract";

export const RECEIPT_STATUS_LABEL: Record<ReceiptStatus, string> = {
  pending: "Menunggu diperiksa",
  needs_review: "Perlu dicek ulang",
  rejected: "Ditolak",
  approved: "Diarsipkan",
};

export const RECEIPT_STATUS_VARIANT: Record<ReceiptStatus, StatusVariant> = {
  pending: "warning",
  needs_review: "warning",
  rejected: "danger",
  approved: "success",
};

/** The engine still has it: nothing to decide yet, and worth polling for. */
export const isInFlight = (row: Pick<ReceiptExtraction, "processStatus">) =>
  row.processStatus === "queued" || row.processStatus === "processing";

/**
 * A receipt waits for a decision until it is approved or rejected, once the
 * engine is done with it. A failed reading is still reviewable: the reviewer
 * types the values instead.
 */
export const isReviewable = (row: Pick<ReceiptExtraction, "status" | "processStatus">) =>
  !isInFlight(row) && (row.status === "pending" || row.status === "needs_review");

export const PROCESS_STATUS_LABEL: Record<Exclude<ProcessStatus, "ready">, string> = {
  queued: "Menunggu dibaca",
  processing: "Sedang dibaca",
  failed: "Gagal dibaca",
};

export const PROCESS_STATUS_VARIANT: Record<Exclude<ProcessStatus, "ready">, StatusVariant> = {
  queued: "process",
  processing: "process",
  failed: "danger",
};

export const CONFIDENCE_LABEL: Record<Confidence, string> = {
  high: "Yakin",
  medium: "Cukup yakin",
  low: "Ragu",
};

export const CONFIDENCE_VARIANT: Record<Confidence, StatusVariant> = {
  high: "success",
  medium: "warning",
  low: "danger",
};

/** How often the queue refreshes while the engine has a receipt. */
export const IN_FLIGHT_POLL_MS = 3000;

/**
 * A pangkalan's LPG payment to the agent: money received, recorded under
 * payments, never filed as an expense (the server refuses it too).
 */
export const isPangkalanPayment = (row: Pick<ReceiptExtraction, "suggestedCategory">) =>
  row.suggestedCategory === "penebusan_pangkalan";

/** Receipts are photos or PDFs, at most 10 MB (the server's limit too). */
export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
