import type { CashVoucher, CashVoucherStatus, CashVoucherType } from "../api/contract";

export const VOUCHER_TYPE_LABEL: Record<CashVoucherType, string> = {
  receipt: "Kas masuk",
  disbursement: "Kas keluar",
  transfer: "Transfer",
};

export const VOUCHER_STATUS_LABEL: Record<CashVoucherStatus, string> = {
  draft: "Draf",
  posted: "Diposting",
  void: "Dibatalkan",
};

/** Who the money moved with: the contact if there is one, else the free text. */
export function voucherParty(v: Pick<CashVoucher, "supplierName" | "outletName" | "counterparty">): string | undefined {
  return v.supplierName ?? v.outletName ?? v.counterparty;
}
