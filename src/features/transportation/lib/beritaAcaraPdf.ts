import type { jsPDF } from "jspdf";
import { formatDateId, formatNumber, formatRupiah } from "@/lib/format";
import type { BeritaAcaraDocument } from "../api/contract";
import { CLAIM_STATUS_LABEL } from "../api/contract";
import { formatRate, formatTariff } from "./rate";

/** "MARET 2026" -- the BA LO names the month its LOs fall in. */
export function periodMonth(periodStart?: string): string {
  if (!periodStart) return "";
  const d = new Date(`${periodStart}T00:00:00`);
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" }).toUpperCase();
}

/** "BA-LO-BAST-SLT-202610-0004.pdf": a name that survives every file system. */
export function beritaAcaraFilename(doc: BeritaAcaraDocument): string {
  const kind = doc.kind === "lo" ? "BA-LO" : "Berita-Acara";
  return `${kind}-${doc.header.claimNumber}`.replace(/[^A-Za-z0-9._-]+/g, "-") + ".pdf";
}

const INK: [number, number, number] = [23, 26, 22];
const MUTED: [number, number, number] = [103, 107, 98];
const LINE: [number, number, number] = [225, 227, 220];
const MARGIN = 16;

/**
 * The Berita Acara as a real PDF file, laid out like its print version (the
 * client's March 2026 BA LO is the model for the LO kind). Text, not an
 * image, so the numbers stay selectable and the file stays small.
 *
 * jsPDF is imported here, on demand, so the ~350 kB it weighs is fetched
 * only by someone who exports.
 */
export async function buildBeritaAcaraPdf(doc: BeritaAcaraDocument): Promise<jsPDF> {
  const [{ jsPDF }, { autoTable }] = await Promise.all([import("jspdf"), import("jspdf-autotable")]);
  const pdf = new jsPDF({ unit: "mm", format: "a4" });
  const pageWidth = pdf.internal.pageSize.getWidth();
  const center = pageWidth / 2;
  const { header, footer, signatory } = doc;
  let y = 20;

  pdf.setTextColor(...INK);
  if (doc.kind === "lo") {
    pdf.setFont("helvetica", "bold").setFontSize(15);
    pdf.text("BERITA ACARA", center, y, { align: "center" });
    pdf.setFontSize(10.5);
    for (const line of [
      "TAGIHAN TRANSPORT FEE AGEN LPG 3 KG",
      `PERIODE BULAN ${periodMonth(header.periodStart)}`,
      header.tenantLegalName.toUpperCase(),
    ]) {
      y += 5.5;
      pdf.text(line, center, y, { align: "center" });
    }
  } else {
    pdf.setFont("helvetica", "normal").setFontSize(8).setTextColor(...MUTED);
    pdf.text(
      `${header.tenantLegalName}${header.tenantAddress ? ` · ${header.tenantAddress}` : ""}`.toUpperCase(),
      MARGIN,
      y,
    );
    pdf.setFont("helvetica", "bold").setFontSize(14).setTextColor(...INK);
    y += 7;
    pdf.text("Berita Acara Tagihan Transport Fee Agen LPG 3 Kg", MARGIN, y);
    pdf.setFont("helvetica", "normal").setFontSize(10);
    y += 5.5;
    pdf.text(
      `Periode Bulan ${header.periodStart ? formatDateId(header.periodStart) : "—"} – ${header.periodEnd ? formatDateId(header.periodEnd) : "—"}`,
      MARGIN,
      y,
    );
    y += 3;
    pdf.setDrawColor(...INK).setLineWidth(0.6).line(MARGIN, y, pageWidth - MARGIN, y);
    const meta: Array<[string, string]> = [
      ["Nomor klaim", header.claimNumber],
      ["No. BAST", header.handoverReference ?? "—"],
      ["Tanggal serah terima", formatDateId(header.handoverDate)],
      ["Cabang", header.branchName],
      ["Status", CLAIM_STATUS_LABEL[header.claimStatus]],
    ];
    const step = (pageWidth - MARGIN * 2) / meta.length;
    meta.forEach(([label, value], i) => {
      pdf.setFontSize(7.5).setTextColor(...MUTED).text(label, MARGIN + i * step, y + 6);
      pdf.setFont("helvetica", "bold").setFontSize(9).setTextColor(...INK).text(value, MARGIN + i * step, y + 10.5);
      pdf.setFont("helvetica", "normal");
    });
    y += 12;
  }

  const right = { halign: "right" as const };
  const table =
    doc.kind === "lo"
      ? {
          head: [["No.", "Tanggal Pengiriman", "Nomor DO/LO", "Jumlah (Tabung)", "Jumlah (KG)", "Tarif/KG (Rp)", "Total Rupiah"]],
          body: doc.loadingOrders.map((l) => [
            String(l.no),
            formatDateId(l.date),
            l.loNumber,
            formatNumber(l.qtyPcs),
            formatNumber(l.qtyKg),
            formatRate(l.ratePerKg),
            formatRupiah(l.amount),
          ]),
          rates: footer.rates.map((r) => formatRate(r.rate)).join(" / "),
        }
      : {
          head: [["No.", "Tanggal", "No. DO/LO", "Tabung", "Kg", "Tarif", "Total Rupiah"]],
          body: doc.lines.map((l) => [
            String(l.no),
            formatDateId(l.deliveryDate),
            l.deliveryNumber,
            formatNumber(l.qty),
            formatNumber(l.weightKg),
            formatTariff(l.rate, l.rateBasis),
            formatRupiah(l.amount),
          ]),
          rates: "",
        };

  autoTable(pdf, {
    startY: y + 6,
    margin: { left: MARGIN, right: MARGIN, bottom: 18 },
    head: table.head,
    body: table.body,
    foot: [
      [
        { content: "Total", colSpan: 3 },
        formatNumber(footer.totalQty),
        formatNumber(footer.totalWeightKg),
        table.rates,
        formatRupiah(footer.amount),
      ],
    ],
    showFoot: "lastPage",
    theme: "plain",
    styles: { font: "helvetica", fontSize: 8.5, textColor: INK, cellPadding: { top: 1.8, bottom: 1.8, left: 2, right: 2 } },
    headStyles: { fontSize: 7.5, fontStyle: "bold", textColor: MUTED, lineColor: INK, lineWidth: { bottom: 0.3 } },
    bodyStyles: { lineColor: LINE, lineWidth: { bottom: 0.2 } },
    footStyles: { fontStyle: "bold", lineColor: INK, lineWidth: { top: 0.5 } },
    columnStyles: { 0: { cellWidth: 10 }, 3: right, 4: right, 5: right, 6: right },
    didParseCell: (cell) => {
      // Headers and totals of the numeric columns sit over their figures.
      if (cell.section !== "body" && cell.column.index >= 3) cell.cell.styles.halign = "right";
    },
  });

  // The signature block keeps together: a new page rather than a name
  // stranded below the fold of the previous one.
  const tableEnd = (pdf as jsPDF & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY;
  const pageHeight = pdf.internal.pageSize.getHeight();
  let signY = tableEnd + 14;
  if (signY + 40 > pageHeight - 18) {
    pdf.addPage();
    signY = 24;
  }
  const signX = MARGIN;
  pdf.setFont("helvetica", "normal").setFontSize(9.5).setTextColor(...INK);
  pdf.text(signatory.companyName, signX, signY);
  if (doc.kind === "lo") {
    pdf.text(signatory.title ?? "Direktur", signX, signY + 5);
    pdf.setFont("helvetica", "bold").text(signatory.name ?? "", signX, signY + 32);
  } else {
    pdf.setDrawColor(...INK).setLineWidth(0.3).line(signX, signY + 24, signX + 70, signY + 24);
    pdf.text(`${signatory.name ?? ""}${signatory.title ? ` — ${signatory.title}` : ""}`, signX, signY + 29);
  }

  const pages = pdf.getNumberOfPages();
  for (let page = 1; page <= pages; page++) {
    pdf.setPage(page);
    pdf.setFont("helvetica", "normal").setFontSize(7.5).setTextColor(...MUTED);
    pdf.text(header.claimNumber, MARGIN, pageHeight - 10);
    pdf.text(`Halaman ${page} dari ${pages}`, pageWidth - MARGIN, pageHeight - 10, { align: "right" });
  }
  return pdf;
}

/** Builds the Berita Acara and saves it as a PDF download. */
export async function downloadBeritaAcaraPdf(doc: BeritaAcaraDocument): Promise<void> {
  const pdf = await buildBeritaAcaraPdf(doc);
  pdf.save(beritaAcaraFilename(doc));
}
