import type { JournalSourceType } from "@/types/domain";

/** What posted a journal, in the words a bookkeeper uses. */
export const JOURNAL_SOURCE_LABEL: Record<JournalSourceType, string> = {
  invoice: "Tagihan",
  payment: "Penerimaan",
  creditNote: "Nota kredit",
  delivery: "Pengiriman",
  manual: "Jurnal umum",
  purchase: "Pembelian",
  expense: "Biaya",
  transportationClaim: "Klaim transport fee",
  cashVoucher: "Kas & bank",
  depreciation: "Penyusutan",
  closing: "Tutup buku",
  openingBalance: "Saldo awal",
  sim3lonOpening: "Saldo awal SIM3LON",
  purchasePayment: "Pembayaran tagihan",
};

/**
 * Where the document behind a journal is worked on, or undefined when the
 * journal is its own document (manual, closing, opening balance). Invoices,
 * vendor bills (and their payments, which the backend links to the bill)
 * and transport fee claims open their own page; the rest open their module.
 */
export function journalSourceHref(type: JournalSourceType, sourceId?: string): string | undefined {
  switch (type) {
    case "invoice":
      return sourceId ? `/receivables/${sourceId}` : "/receivables";
    case "creditNote":
      return "/receivables";
    case "payment":
      return "/payments";
    case "delivery":
      return "/transactions";
    case "purchase":
    case "purchasePayment":
      return sourceId ? `/purchases/${sourceId}` : "/purchases";
    case "expense":
      return "/expenses";
    case "transportationClaim":
      return sourceId ? `/transportation-claims/${sourceId}` : "/transportation-claims";
    case "cashVoucher":
      return "/cash-bank";
    case "depreciation":
      return "/assets";
    default:
      return undefined;
  }
}
