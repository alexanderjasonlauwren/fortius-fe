import { escapeHtml } from "@/lib/export";
import { terbilang } from "@/lib/terbilang";
import type { TransportInvoice } from "../api/contract";

/** "12 Oktober 2026": the invoice writes the month out in full. */
function longDate(iso?: string): string {
  if (!iso) return "";
  return new Date(`${iso}T00:00:00`).toLocaleDateString("id-ID", { day: "2-digit", month: "long", year: "numeric" });
}

function rupiah(amount: number): string {
  return Math.round(amount).toLocaleString("id-ID");
}

/**
 * The invoice as the client sends it to Pertamina (their September 2026
 * invoice is the model): number, principal, their order, our faktur, the fee
 * and its PPN, the amount in words, where to pay, and the signature.
 */
export function invoiceHtml(invoice: TransportInvoice): string {
  const e = escapeHtml;
  const address = (invoice.recipientAddress ?? "")
    .split(/\n/)
    .map((line) => e(line))
    .join("<br />");
  const bank = invoice.bank;
  const signCompany = (invoice.bank?.accountHolder || invoice.signatory.companyName).toUpperCase();
  return `
    <div style="display:flex;justify-content:space-between;align-items:flex-start">
      <div>
        <h1 style="font-size:26px;letter-spacing:.08em">INVOICE</h1>
        <p class="eyebrow" style="margin-top:14px">Kepada</p>
        <p style="margin:4px 0 0;font-weight:700">${e(invoice.recipientName)}</p>
        <p style="margin:2px 0 0;max-width:340px">${address}</p>
      </div>
      <div style="text-align:right">
        <p class="eyebrow">Nomor</p>
        <p class="code" style="margin:2px 0 0;font-size:13px;font-weight:700">${e(invoice.invoiceNumber)}</p>
      </div>
    </div>
    <hr class="rule" />
    <div style="display:flex;gap:48px">
      <div>
        <p class="eyebrow">Order Anda</p>
        <p style="margin:4px 0 0">No.PO/No SPB : <span class="code">${e(invoice.orderReference ?? "—")}</span></p>
        <p style="margin:2px 0 0">Tanggal : ${e(longDate(invoice.orderDate) || "—")}</p>
      </div>
      <div>
        <p class="eyebrow">Faktur kami</p>
        <p style="margin:4px 0 0">No : <span class="code">${e(invoice.taxInvoiceNumber ?? "—")}</span></p>
        <p style="margin:2px 0 0">Tanggal : ${e(longDate(invoice.taxInvoiceDate) || "—")}</p>
      </div>
    </div>
    <table style="margin-top:22px">
      <tbody>
        <tr>
          <td>${e(invoice.description)}</td>
          <td style="width:40px">Rp.</td>
          <td class="num" style="width:140px">${rupiah(invoice.amount)}</td>
        </tr>
        <tr>
          <td>PPN ${invoice.vatRate}%</td>
          <td>Rp.</td>
          <td class="num">${invoice.vatAmount ? rupiah(invoice.vatAmount) : "0,-"}</td>
        </tr>
      </tbody>
      <tfoot>
        <tr>
          <td style="text-align:right">Total</td>
          <td>Rp.</td>
          <td class="num">${rupiah(invoice.total)}</td>
        </tr>
      </tfoot>
    </table>
    <p style="margin-top:12px"><span class="eyebrow">Terbilang</span>
      <strong style="display:block;margin-top:2px">*${terbilang(invoice.total).toUpperCase()}*</strong></p>
    <div style="margin-top:18px">
      <p class="eyebrow">Pembayaran melalui</p>
      <p style="margin:4px 0 0">Bank : ${e(bank ? `BANK ${bank.bankName}` : "—")}</p>
      <p style="margin:2px 0 0">No Rekening : <span class="code">${e(bank?.accountNumber ?? "—")}</span></p>
      <p style="margin:2px 0 0">Untuk Acc : ${e(bank?.accountHolder ?? "—")}</p>
    </div>
    <div style="margin-top:28px;margin-left:auto;width:45%;text-align:center">
      <p style="margin:0">${e(invoice.place ?? invoice.signatory.city ?? "")}, ${e(longDate(invoice.invoiceDate))}</p>
      <p style="margin:2px 0 0;font-weight:700">${e(signCompany)}</p>
      <p style="margin:64px 0 0;font-weight:700">${e(invoice.signatory.name ?? "")}</p>
      ${invoice.signatory.title ? `<p style="margin:0">${e(invoice.signatory.title)}</p>` : ""}
    </div>`;
}

