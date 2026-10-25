import { describe, expect, it } from "vitest";
import { beritaAcaraFilename, buildBeritaAcaraPdf } from "./beritaAcaraPdf";
import type { BeritaAcaraDocument, LoadingOrderLine } from "../api/contract";

function lo(no: number, loNumber: string, pcs: number): LoadingOrderLine {
  return {
    no, date: "2026-10-01", loNumber, soNumber: "0003040733", material: "REFILL/ISI LPG @3KG (NET)",
    qtyPcs: pcs, qtyKg: pcs * 3, ratePerKg: 354.64, amount: pcs * 3 * 354.64,
  };
}

function baLo(lines: LoadingOrderLine[]): BeritaAcaraDocument {
  const kg = lines.reduce((s, l) => s + l.qtyKg, 0);
  return {
    kind: "lo",
    loadingOrders: lines,
    header: {
      claimNumber: "BAST-SLT-202610-0004", handoverDate: "2026-11-02", periodStart: "2026-10-01",
      periodEnd: "2026-11-01", tenantLegalName: "PT. Bhakta Dharma Anindita", branchName: "Pool Salatiga",
      claimStatus: "draft",
    },
    groups: [],
    lines: [],
    footer: {
      lineCount: lines.length, groupCount: 0, totalQty: lines.reduce((s, l) => s + l.qtyPcs, 0), totalWeightKg: kg,
      rates: [{ rateBasis: "per_kg", rate: 354.64, qty: 0, weightKg: kg, amount: Math.round(kg * 354.64) }],
      amount: Math.round(kg * 354.64), sumOfLineAmounts: kg * 354.64, roundingDifference: 0, driftedLineCount: 0,
    },
    signatory: { companyName: "PT. Bhakta Dharma Anindita", title: "Direktur", name: "Bimbo Adhi Nugroho" },
  } as BeritaAcaraDocument;
}

/** The text a PDF draws, from its uncompressed content streams. */
function drawnText(pdf: { output(): string }): string {
  return [...pdf.output().matchAll(/\(((?:\\.|[^\\)])*)\)\s*Tj/g)].map((m) => m[1]).join("\n");
}

describe("Berita Acara PDF", () => {
  it("carries the BA LO's title, every LO, the total and the signature", async () => {
    const text = drawnText(await buildBeritaAcaraPdf(baLo([lo(1, "8144838990", 560), lo(2, "8144838992", 360)])));
    for (const expected of [
      "BERITA ACARA",
      "TAGIHAN TRANSPORT FEE AGEN LPG 3 KG",
      "PERIODE BULAN OKTOBER 2026",
      "8144838990",
      "8144838992",
      "2.760",
      "Rp 978.806",
      "Bimbo Adhi Nugroho",
      "Halaman 1 dari 1",
    ]) {
      expect(text).toContain(expected);
    }
  });

  it("runs onto further pages, numbering each, with the total once at the end", async () => {
    const many = Array.from({ length: 60 }, (_, i) => lo(i + 1, String(8144838000 + i), 360));
    const pdf = await buildBeritaAcaraPdf(baLo(many));
    const text = drawnText(pdf);
    expect(pdf.getNumberOfPages()).toBeGreaterThan(1);
    expect(text).toContain(`Halaman ${pdf.getNumberOfPages()} dari ${pdf.getNumberOfPages()}`);
    expect(text).toContain(String(8144838000 + 59));
    expect(text.match(/^Total$/gm)).toHaveLength(1);
  });

  it("names the file after the claim", () => {
    expect(beritaAcaraFilename(baLo([]))).toBe("BA-LO-BAST-SLT-202610-0004.pdf");
  });
});
