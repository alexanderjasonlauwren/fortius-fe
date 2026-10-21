import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { sourcePlanMessage, type SourcePlanReview } from "../api/sourcePlanReview.contract";

export function SourcePlanStatus({ review, isLoading, error, fillError, isFilling, canFill, onRetry }: {
  review?: SourcePlanReview; isLoading: boolean; error?: Error | null; fillError?: Error | null;
  isFilling: boolean; canFill: boolean; onRetry: () => void;
}) {
  return <section aria-label="Sumber alokasi SIM3LON" className="rounded-lg border border-line bg-panel p-4 text-sm text-ink-muted">
    <p className="label text-xs text-ink">Rencana SIM3LON</p>
    <p className="mt-1" role={error || fillError ? "alert" : "status"}>
      {isFilling ? "Memeriksa dan mengisi alokasi; rencana yang dibuat tetap tersimpan." : error ? "Sumber SIM3LON gagal dimuat. Ini bukan alokasi nol; jangan membuat rencana baru untuk mencoba kembali." : isLoading ? "Memuat alokasi SIM3LON untuk tanggal rencana." : review ? sourcePlanMessage(review) : "Pilih rencana dengan SA untuk meninjau sumber alokasi."}
    </p>
    {fillError ? <p className="mt-1 text-rust-ink">{fillError.message} Rencana tetap tersimpan.</p> : null}
    {review?.unresolvedRegistrationCodes.length ? <p className="mt-1">Kode pangkalan belum cocok: {review.unresolvedRegistrationCodes.join(", ")}</p> : null}
    <p className="mt-2 text-xs">Upload baru belum otomatis memperbarui draf lama. Tinjau kuantitas sebelum konfirmasi; rekonsiliasi sumber belum tersedia.</p>
    <div className="mt-3 flex flex-wrap items-center gap-3">
      {(error || fillError || (canFill && review?.status === "ready")) ? <Button size="sm" variant="outline" disabled={isFilling} onClick={onRetry}>{canFill && !error && !fillError ? "Isi alokasi pada draf ini" : "Coba lagi pada rencana ini"}</Button> : null}
      <Link to="/sa" className="text-xs text-ink underline">Periksa unggahan SA</Link>
    </div>
  </section>;
}
