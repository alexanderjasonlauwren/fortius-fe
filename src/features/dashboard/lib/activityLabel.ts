/**
 * Beranda's "Jejak aktivitas" in words.
 *
 * The audit trail records requests, not sentences: a module (the route's first
 * resource), an entity (its last) and an action (create, update, delete). The
 * routes a person acts through every day get a sentence here; anything else
 * falls back to "<what> <verb>", which is plain if less graceful, so a new
 * route never shows up as nothing.
 */
const SENTENCES: Record<string, string> = {
  "payments/payments/create": "Penerimaan kas dicatat",
  "payments/verify/create": "Penerimaan kas diverifikasi",
  "payments/reject/create": "Penerimaan kas ditolak",
  "payments/allocations/create": "Penerimaan dialokasikan ke tagihan",
  "payments/funding/create": "Dana pengiriman dialokasikan",
  "payments/funding/delete": "Alokasi dana pengiriman dilepas",
  "invoices/manual/create": "Tagihan manual diterbitkan",
  "credit-notes/credit-notes/create": "Nota kredit diterbitkan",
  "credit-notes/apply/create": "Nota kredit diterapkan",
  "distribution/orders/create": "Rencana distribusi dibuat",
  "distribution/orders/update": "Rencana distribusi diubah",
  "distribution/confirm/create": "Rencana distribusi dikonfirmasi",
  "distribution/assignment/update": "Penugasan armada disimpan",
  "distribution/dispatch/create": "Rit diberangkatkan",
  "deliveries/depart/create": "Sopir berangkat",
  "deliveries/arrive/create": "Sopir tiba di tujuan",
  "deliveries/complete/create": "Pengiriman diselesaikan",
  "deliveries/fail/create": "Pengiriman gagal dicatat",
  "expenses/expenses/create": "Pengeluaran dicatat",
  "expenses/approve/create": "Pengeluaran disetujui",
  "purchases/general/create": "Tagihan vendor dicatat",
  "purchases/payments/create": "Pembayaran vendor dicatat",
  "cash-vouchers/cash-vouchers/create": "Voucher kas dibuat",
  "cash-vouchers/post/create": "Voucher kas diposting",
  "void-requests/void-requests/create": "Pembatalan diajukan",
  "void-requests/approve/create": "Pembatalan disetujui",
  "transportation-claims/transportation-claims/create": "Klaim transport fee dibuat",
  "inventory/stock-counts/create": "Stok opname dicatat",
};

const SUBJECTS: Record<string, string> = {
  outlets: "Data pangkalan", products: "Produk", users: "Pengguna", vehicles: "Armada",
  drivers: "Sopir", tenants: "Profil perusahaan", "schedule-agreements": "Schedule agreement",
  journals: "Jurnal", accounts: "Akun", "bank-accounts": "Rekening", suppliers: "Vendor",
};

const VERBS: Record<string, string> = {
  create: "ditambah", update: "diubah", delete: "dihapus",
};

export function activityLabel(module: string, entity: string, action: string): string {
  const sentence = SENTENCES[`${module}/${entity}/${action}`];
  if (sentence) return sentence;
  const subject = SUBJECTS[module] ?? module.replace(/-/g, " ");
  const what = subject.charAt(0).toUpperCase() + subject.slice(1);
  return `${what} ${VERBS[action] ?? action}`;
}
