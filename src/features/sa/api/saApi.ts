import { printDocument } from "@/lib/export";
import { supplierLabelTitle, unitLabelTitle } from "@/lib/lexicon";
import { saApiHttp } from "./saApi.http";
import type { ScheduleAgreementApi } from "./contract";

const api: ScheduleAgreementApi = saApiHttp;

export const getSAList = api.getSAList.bind(api);
export const getSADetail = api.getSADetail.bind(api);
export const getImportSummary = api.getImportSummary.bind(api);
export const uploadSA = api.uploadSA.bind(api);
export const activateSA = api.activateSA.bind(api);
export const deleteSA = api.deleteSA.bind(api);
export const getSupplierOptions = api.getSupplierOptions.bind(api);
export const parseImport = api.parseImport.bind(api);
export const applyImport = api.applyImport.bind(api);
export const previewSIM3LON = api.previewSIM3LON.bind(api);
export const getSIM3LONReconciliation = api.getSIM3LONReconciliation.bind(api);
export const applySIM3LON = api.applySIM3LON.bind(api);
export const syncLivePenyaluran = api.syncLivePenyaluran.bind(api);
export const getLivePenyaluranCandidates = api.getLivePenyaluranCandidates.bind(api);
export const setPlanningCutover = api.setPlanningCutover.bind(api);
export const getSIM3LONVariances = api.getSIM3LONVariances.bind(api);
export const getSIM3LONDefaultProduct = api.getSIM3LONDefaultProduct.bind(api);
export const setSIM3LONDefaultProduct = api.setSIM3LONDefaultProduct.bind(api);

/**
 * Printing is a browser concern, not a data source.
 *
 * It renders what is already on screen, so it belongs to neither adapter and is
 * deliberately outside the contract — putting it there would oblige an HTTP
 * implementation to answer a question the server has no part in.
 *
 * Built from the domain object both adapters return, so it works identically in
 * either build. The mock version used to list the plans drawing on the
 * agreement; that is dropped, because the API cannot supply them yet and a
 * document that silently shows fewer plans against a real backend than a demo
 * would be worse than one that shows none.
 */
export async function printSA(id: string): Promise<void> {
  const sa = await getSADetail(id);
  const fmt = (n: number) => n.toLocaleString("id-ID");
  const tanggal = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  printDocument(
    `${sa.nomorSA} — Ringkasan Kuota`,
    `
    <h1>Ringkasan Kuota Schedule Agreement</h1>
    <hr class="rule" />
    <div class="meta">
      <div>Nomor SA<strong class="code">${sa.nomorSA}</strong></div>
      <div>${supplierLabelTitle()}<strong>${sa.supplier}</strong></div>
      <div>Periode<strong>${tanggal(sa.periodeMulai)} – ${tanggal(sa.periodeBerakhir)}</strong></div>
      <div>Status<strong>${sa.status}</strong></div>
    </div>
    <table>
      <thead><tr><th>Uraian</th><th style="text-align:right">${unitLabelTitle()}</th></tr></thead>
      <tbody>
        <tr><td>Total kuota</td><td class="num">${fmt(sa.totalKuota)}</td></tr>
        <tr><td>Sudah didistribusikan</td><td class="num">${fmt(sa.sudahDidistribusikan)}</td></tr>
      </tbody>
      <tfoot><tr><td>Sisa kuota</td><td class="num">${fmt(sa.sisaKuota)}</td></tr></tfoot>
    </table>`,
  );
}
