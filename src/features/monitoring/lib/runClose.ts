import type { RunCount } from "../api/contract";
import type { RunDocument } from "../types";

/**
 * Surat jalan still waiting on the driver. The server refuses to close a run
 * over them (RUN_HAS_OPEN_STOPS), so the dialog says so before it is asked.
 */
export function openDocuments(dokumen: RunDocument[]): RunDocument[] {
  return dokumen.filter((d) => d.status === "Antrian" || d.status === "Proses");
}

/**
 * The corrections to send: only surat jalan whose delivered count the office
 * changed. A drop left as the driver filed it is not sent -- the server keeps
 * the filing and books an unfiled return itself -- so a close with no edits
 * sends no counts at all.
 */
export function countsToSend(
  dokumen: RunDocument[],
  draft: Record<string, { diterima: number; kembali: number; catatan: string }>,
): RunCount[] {
  return dokumen
    .filter((d) => {
      const row = draft[d.id];
      return row && (row.diterima !== d.diterima || row.kembali !== d.dimuat - d.diterima);
    })
    .map((d) => ({
      deliveryId: d.id,
      diterima: draft[d.id].diterima,
      kembali: draft[d.id].kembali,
      catatan: draft[d.id].catatan.trim() || undefined,
    }));
}

/**
 * A surat jalan whose returned tabung can be scheduled again: its run is
 * closed, something came back, the credit is booked (the deposit that pays
 * the redelivery exists) and it is not already carried. The server refuses
 * every other case; the board does not offer them.
 */
export function redeliverable(d: RunDocument): boolean {
  return d.dikonfirmasi && d.dimuat > d.diterima && !!d.notaKredit && !d.kirimUlang;
}

function isoDay(d: Date): string {
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

/** Today in the browser's calendar -- the earliest day the server accepts. */
export function today(): string {
  return isoDay(new Date());
}

/** Tomorrow, yyyy-mm-dd -- the usual day to send again. */
export function tomorrow(): string {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return isoDay(d);
}
