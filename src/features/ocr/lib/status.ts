import type { StatusVariant } from "@/lib/status";
import type { ReceiptStatus } from "../api/contract";

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

/** A receipt waits for a decision until it is approved or rejected. */
export const isReviewable = (status: ReceiptStatus) => status === "pending" || status === "needs_review";

/** Receipts are photos or PDFs, at most 10 MB (the server's limit too). */
export const RECEIPT_ACCEPT = "image/jpeg,image/png,image/webp,application/pdf";
export const MAX_RECEIPT_BYTES = 10 * 1024 * 1024;
