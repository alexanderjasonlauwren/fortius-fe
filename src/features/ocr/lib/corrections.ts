import type { ReceiptCorrections, ReceiptExtraction } from "../api/contract";

/** The values a reviewer edits; an empty field means "leave as read". */
export interface ReviewedValues {
  merchantName: string;
  txnDate: string;
  totalAmount: number;
  referenceNo: string;
}

/**
 * What the reviewer changed, against what the receipt already says. Only
 * changes are sent, so the server records a correction only where there was
 * one, and the engine's reading stays beside it.
 */
export function correctionsOf(
  row: Pick<ReceiptExtraction, "merchantName" | "txnDate" | "totalAmount" | "referenceNo">,
  values: ReviewedValues,
): ReceiptCorrections | undefined {
  const corrections: ReceiptCorrections = {};
  const merchant = values.merchantName.trim();
  if (merchant && merchant !== (row.merchantName ?? "")) corrections.merchantName = merchant;
  if (values.txnDate && values.txnDate !== (row.txnDate ?? "")) corrections.txnDate = values.txnDate;
  if (values.totalAmount > 0 && values.totalAmount !== (row.totalAmount ?? 0)) corrections.totalAmount = values.totalAmount;
  const reference = values.referenceNo.trim();
  if (reference && reference !== (row.referenceNo ?? "")) corrections.referenceNo = reference;
  return Object.keys(corrections).length ? corrections : undefined;
}
