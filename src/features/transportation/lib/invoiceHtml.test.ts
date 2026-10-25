import { describe, expect, it } from "vitest";
import { invoiceHtml } from "./invoiceHtml";
import type { TransportInvoice } from "../api/contract";

const september: TransportInvoice = {
  id: "i-1",
  claimId: "c-1",
  claimNumber: "BAST-SLT-202610-0003",
  claimStatus: "approved",
  invoiceNumber: "01/PT.BDA/TF/12102026",
  invoiceDate: "2026-10-12",
  recipientName: "PT. PERTAMINA PATRA NIAGA",
  recipientAddress: "GEDUNG WISMA TUGU II LT 2\nDKI JAKARTA, 12920",
  orderReference: "SP - 001/PND700000/2025-S0",
  orderDate: "2025-01-03",
  taxInvoiceNumber: "08002600419112271",
  taxInvoiceDate: "2026-10-12",
  description: "Transport fee Agen LPG 3kg Periode September 2026",
  amount: 12_298_915,
  vatRate: 12,
  vatAmount: 0,
  total: 12_298_915,
  bank: { id: "b-1", bankName: "BNI", accountNumber: "1792837164", accountHolder: "PT. BHAKTA DHARMA ANINDITA" },
  place: "Salatiga",
  signatory: { companyName: "PT. Bhakta Dharma Anindita", name: "Bimbo Adhi Nugroho" },
};

describe("invoiceHtml", () => {
  it("prints what the client's September 2026 invoice carries", () => {
    const html = invoiceHtml(september);
    for (const expected of [
      "01/PT.BDA/TF/12102026",
      "SP - 001/PND700000/2025-S0",
      "03 Januari 2025",
      "08002600419112271",
      "12.298.915",
      "PPN 12%",
      "0,-",
      "*DUA BELAS JUTA DUA RATUS SEMBILAN PULUH DELAPAN RIBU SEMBILAN RATUS LIMA BELAS RUPIAH*",
      "BANK BNI",
      "1792837164",
      "Salatiga, 12 Oktober 2026",
      "Bimbo Adhi Nugroho",
    ]) {
      expect(html).toContain(expected);
    }
    expect(html).toContain("GEDUNG WISMA TUGU II LT 2<br />DKI JAKARTA");
  });

  it("escapes what a user typed: the print frame runs as the console", () => {
    const html = invoiceHtml({ ...september, orderReference: "<img src=x onerror=alert(1)>", recipientAddress: "<b>x</b>" });
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>x</b>");
    expect(html).toContain("&lt;img");
  });

  it("prints a PPN that was charged and totals it into the words", () => {
    const html = invoiceHtml({ ...september, amount: 1_000_000, vatAmount: 110_000, total: 1_110_000 });
    expect(html).toContain(">110.000<");
    expect(html).toContain("SATU JUTA SERATUS SEPULUH RIBU RUPIAH");
  });
});
