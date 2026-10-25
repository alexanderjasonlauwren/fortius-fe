import type { CashVoucher } from "../api/contract";

/**
 * A voucher's contact as one select value: "s:<id>" for a vendor,
 * "o:<id>" for a pangkalan, "" for none. One control, because the backend
 * takes at most one of the two.
 */
export function contactValue(v: Pick<CashVoucher, "supplierId" | "outletId">): string {
  if (v.supplierId) return `s:${v.supplierId}`;
  if (v.outletId) return `o:${v.outletId}`;
  return "";
}

export function parseContact(value: string): { supplierId?: string; outletId?: string } {
  if (value.startsWith("s:")) return { supplierId: value.slice(2) };
  if (value.startsWith("o:")) return { outletId: value.slice(2) };
  return {};
}
