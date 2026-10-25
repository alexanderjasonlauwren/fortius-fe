import type { PurchasePaymentStatus, PurchaseView } from "@/features/purchases/api/contract";
import type { StatusVariant } from "@/lib/status";
import { todayIso } from "@/lib/date";

export const PURCHASE_STATUS_LABEL: Record<PurchasePaymentStatus, string> = {
  unpaid: "Belum dibayar",
  partial: "Dibayar sebagian",
  paid: "Lunas",
  void: "Batal",
};

/** A bill still owed and past its due date reads as overdue. */
export function isOverdue(bill: PurchaseView, today = todayIso()): boolean {
  return (bill.paymentStatus === "unpaid" || bill.paymentStatus === "partial") && bill.dueDate < today;
}

export function purchaseStatusVariant(bill: PurchaseView): StatusVariant {
  if (bill.paymentStatus === "paid") return "success";
  if (bill.paymentStatus === "void") return "draft";
  return isOverdue(bill) ? "danger" : "warning";
}
