import type { VendorView } from "../api/contract";

/** Whether a vendor matches a free-text search: name, code, contact, phone or email. */
export function vendorMatches(v: VendorView, term: string): boolean {
  const q = term.trim().toLowerCase();
  if (!q) return true;
  return [v.name, v.code, v.contactPerson, v.phone, v.email].some((f) => f?.toLowerCase().includes(q));
}
