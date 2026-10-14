/**
 * The printable invoice (Faktur): what is sent to the pangkalan, or saved
 * as PDF from the browser's print dialog. Built from the detail page's own
 * data, so it can never print something the screen does not show.
 */
import type { InvoiceDetailView } from "@/features/finance/api/contract";
import { escapeHtml as e, printDocument } from "@/lib/export";
import { formatDateLong, formatRupiah } from "@/lib/format";

export interface InvoicePrintContext {
  /** The issuing company, as it should read on the document. */
  perusahaan: string;
  /** Pangkalan name and address lines. */
  pelanggan: string;
  alamat?: string;
}

export function invoiceDocumentHtml(inv: InvoiceDetailView, ctx: InvoicePrintContext): string {
  const rows = inv.lines
    .map((l) => `<tr><td>${e(l.uraian)}</td><td class="num">${e(l.qty)}</td>
      <td class="num">${e(formatRupiah(l.harga))}</td><td class="num">${e(formatRupiah(l.jumlah))}</td></tr>`)
    .join("");
  const settled = inv.terbayar + inv.kredit;
  return `
    <div class="eyebrow">${e(ctx.perusahaan)}</div>
    <h1>Faktur ${e(inv.nomor)}${inv.status === "Batal" ? " — DIBATALKAN" : ""}</h1>
    <hr class="rule" />
    <div class="meta">
      <div>Kepada<strong>${e(ctx.pelanggan)}</strong>${ctx.alamat ? e(ctx.alamat) : ""}</div>
      <div>Tanggal<strong>${e(formatDateLong(inv.tanggal))}</strong></div>
      <div>Jatuh tempo<strong>${e(formatDateLong(inv.jatuhTempo))}</strong></div>
      ${inv.suratJalan !== "—" ? `<div>Surat jalan<strong class="code">${e(inv.suratJalan)}</strong></div>` : ""}
      ${inv.referensi ? `<div>No. referensi<strong class="code">${e(inv.referensi)}</strong></div>` : ""}
    </div>
    <table>
      <thead><tr><th>Uraian</th><th style="text-align:right">Qty</th>
        <th style="text-align:right">Harga</th><th style="text-align:right">Jumlah</th></tr></thead>
      <tbody>${rows}</tbody>
      <tfoot>
        <tr><td colspan="3">Subtotal</td><td class="num">${e(formatRupiah(inv.subtotal))}</td></tr>
        ${inv.pajak > 0 ? `<tr><td colspan="3">PPN ${e(inv.persenPajak)}%</td><td class="num">${e(formatRupiah(inv.pajak))}</td></tr>` : ""}
        <tr><td colspan="3">Total</td><td class="num">${e(formatRupiah(inv.total))}</td></tr>
        ${settled > 0 ? `<tr><td colspan="3">Sudah dibayar / dikreditkan</td><td class="num">${e(formatRupiah(settled))}</td></tr>
        <tr><td colspan="3">Sisa tagihan</td><td class="num">${e(formatRupiah(inv.sisa))}</td></tr>` : ""}
      </tfoot>
    </table>
    ${inv.keterangan ? `<p>${e(inv.keterangan)}</p>` : ""}
    <div class="sign"><div>Diterima oleh<span>&nbsp;</span></div><div>Hormat kami<span>${e(ctx.perusahaan)}</span></div></div>`;
}

export function printInvoice(inv: InvoiceDetailView, ctx: InvoicePrintContext): void {
  printDocument(`Faktur ${inv.nomor}`, invoiceDocumentHtml(inv, ctx));
}
