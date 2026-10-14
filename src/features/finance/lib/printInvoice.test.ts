import { describe, expect, it } from "vitest";
import type { InvoiceDetailView } from "@/features/finance/api/contract";
import { invoiceDocumentHtml } from "./printInvoice";

function invoice(overrides: Partial<InvoiceDetailView> = {}): InvoiceDetailView {
  return {
    id: "i-1", nomor: "INV-SLT-0001", outletId: "o-1", outlet: "Pangkalan A", kecamatan: "Sidorejo",
    suratJalan: "SJ-0001", invoiceType: "delivery", tanggal: "2026-10-01", jatuhTempo: "2026-10-08",
    umurHari: 0, bucket: "Belum jatuh tempo", jumlahUnit: 80, total: 1_200_000, terbayar: 0, kredit: 0,
    sisa: 1_200_000, status: "Terbit", termin: 7, version: 1,
    lines: [{ uraian: "LPG 3 Kg", qty: 80, harga: 15_000, jumlah: 1_200_000 }],
    subtotal: 1_200_000, persenPajak: 0, pajak: 0,
    ...overrides,
  };
}

describe("printed invoice", () => {
  it("carries the lines, the totals and the surat jalan it bills", () => {
    const html = invoiceDocumentHtml(invoice(), { perusahaan: "PT Bhakta", pelanggan: "Pangkalan A" });
    expect(html).toContain("INV-SLT-0001");
    expect(html).toContain("LPG 3 Kg");
    expect(html).toContain("SJ-0001");
    expect(html).toContain("1.200.000");
    // Nothing settled yet: no remaining-balance line to confuse the reader.
    expect(html).not.toContain("Sisa tagihan");
  });

  it("escapes anything typed by a user", () => {
    const html = invoiceDocumentHtml(
      invoice({ keterangan: "<img src=x onerror=alert(1)>", lines: [{ uraian: "<b>x</b>", qty: 1, harga: 1, jumlah: 1 }] }),
      { perusahaan: "PT <script>", pelanggan: "A & B" },
    );
    expect(html).not.toContain("<img");
    expect(html).not.toContain("<b>x</b>");
    expect(html).not.toContain("<script>");
    expect(html).toContain("A &amp; B");
  });

  it("marks a void invoice on its face", () => {
    expect(invoiceDocumentHtml(invoice({ status: "Batal" }), { perusahaan: "P", pelanggan: "Q" })).toContain("DIBATALKAN");
  });
});
