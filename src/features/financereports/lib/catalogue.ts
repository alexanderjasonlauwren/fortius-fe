/**
 * Everything the Laporan hub lists, and the command palette searches: the
 * report pack's catalogue from the server, plus the statements and working
 * lists that live on their own pages, each with the permission its page
 * asserts (accounting parity P6).
 */
import { PERMISSIONS } from "@/features/rbac/permissions";
import type { ReportCategory, ReportDefinition } from "../api/contract";

export interface HubEntry {
  key: string;
  title: string;
  description: string;
  href: string;
  category: ReportCategory;
}

interface StaticEntry extends HubEntry {
  permission: string;
}

const STATIC_ENTRIES: StaticEntry[] = [
  { key: "laba_rugi", category: "ikhtisar", title: "Laba Rugi", description: "Pendapatan, HPP, biaya, dan laba bersih untuk satu periode.", href: "/financial-statements?tab=laba-rugi", permission: PERMISSIONS.FINANCIAL_STATEMENTS_VIEW },
  { key: "neraca", category: "ikhtisar", title: "Neraca", description: "Aset, kewajiban, dan ekuitas per tanggal.", href: "/financial-statements?tab=neraca", permission: PERMISSIONS.FINANCIAL_STATEMENTS_VIEW },
  { key: "penjelasan", category: "ikhtisar", title: "Penjelasan Akun", description: "Rincian setiap pos Neraca per akun.", href: "/financial-statements?tab=penjelasan", permission: PERMISSIONS.FINANCIAL_STATEMENTS_VIEW },
  { key: "komparasi", category: "ikhtisar", title: "Komparasi", description: "Laporan sistem dibandingkan dengan laporan yang diimpor atau periode lain.", href: "/financial-statements?tab=komparasi", permission: PERMISSIONS.FINANCIAL_STATEMENTS_VIEW },
  { key: "buku_besar", category: "ikhtisar", title: "Buku Besar", description: "Mutasi dan saldo berjalan satu akun.", href: "/financial-statements?tab=buku-besar", permission: PERMISSIONS.FINANCIAL_STATEMENTS_VIEW },
  { key: "neraca_saldo", category: "ikhtisar", title: "Neraca Saldo", description: "Saldo awal, mutasi, dan saldo akhir setiap akun.", href: "/ledger?tab=neraca-saldo", permission: PERMISSIONS.JOURNALS_VIEW },
  { key: "daftar_penjualan", category: "penjualan", title: "Daftar Penjualan", description: "Setiap surat jalan dengan tagihan dan status bayarnya — daftar kerja penagihan.", href: "/transactions", permission: PERMISSIONS.TRANSACTIONS_VIEW },
];

/** Opened most, shown first on the hub. */
export const FAVOURITE_KEYS = ["laba_rugi", "neraca", "cash_flow", "ar_aging", "ap_aging"];

/** Every entry this person may open, in catalogue order: the statements
 *  first within Ikhtisar, the pack's own reports after them. */
export function hubEntries(catalogue: ReportDefinition[], has: (permission: string) => boolean): HubEntry[] {
  const statics: HubEntry[] = STATIC_ENTRIES.filter((e) => has(e.permission)).map((e) => ({
    key: e.key, title: e.title, description: e.description, href: e.href, category: e.category,
  }));
  const reports: HubEntry[] = has(PERMISSIONS.FINANCE_REPORTS_VIEW)
    ? catalogue.map((d) => ({ key: d.key, title: d.title, description: d.description, href: `/laporan/${d.key}`, category: d.category }))
    : [];
  return [...statics, ...reports];
}

export function favourites(entries: HubEntry[]): HubEntry[] {
  return FAVOURITE_KEYS.map((k) => entries.find((e) => e.key === k)).filter((e): e is HubEntry => !!e);
}
