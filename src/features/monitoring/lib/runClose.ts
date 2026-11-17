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
