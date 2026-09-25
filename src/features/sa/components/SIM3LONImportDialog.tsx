import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  AlertTriangle,
  ArrowRight,
  FileSpreadsheet,
  Loader2,
  RefreshCw,
  ShieldAlert,
  Upload,
} from "lucide-react";
import { Field, FileDrop, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { getProducts } from "@/features/products/api/productApi";
import { scopeKey } from "@/mocks/scope";
import { formatNumber } from "@/lib/format";
import { supplierLabel, unitLabel } from "@/lib/lexicon";
import { buildSIM3LONApplyReview, useSIM3LONImport } from "../hooks/useSIM3LONImport";
import type {
  SIM3LONChangeClassification,
  SIM3LONPreview,
  SIM3LONReconciliationPreview,
} from "../types";

export function SIM3LONImportDialog({ open, onClose, supplierOptions = [] }: {
  open: boolean;
  onClose: () => void;
  supplierOptions?: string[];
}) {
  const [file, setFile] = useState<File | null>(null);
  const [supplierName, setSupplierName] = useState("");
  const [productId, setProductId] = useState("");
  const products = useQuery({
    queryKey: [...scopeKey(), "sim3lon-product-options"],
    queryFn: () => getProducts({ onlyActive: true }),
    enabled: open,
  });
  const {
    preview,
    reconciliation,
    reviewNotice,
    discard,
    previewMutation,
    reconciliationMutation,
    applyMutation,
  } = useSIM3LONImport();

  const close = () => {
    setFile(null);
    setSupplierName("");
    setProductId("");
    discard();
    onClose();
  };

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impor Penyaluran Harian SIM3LON</DialogTitle>
          <DialogDescription>
            Unggah ekspor XLSX bulanan, periksa perubahan dan pangkalan yang belum di-seed,
            lalu terapkan sebagai sumber kebenaran bulan tersebut.
          </DialogDescription>
        </DialogHeader>

        {reviewNotice && !preview && (
          <div className="rounded-lg border border-signal/30 bg-signal-soft px-3 py-2 text-xs text-signal-ink">
            {reviewNotice}
          </div>
        )}

        {preview ? (
          <Review
            preview={preview}
            reconciliation={reconciliation}
            reviewNotice={reviewNotice}
            pending={applyMutation.isPending || reconciliationMutation.isPending}
            onBack={() => { discard(); setFile(null); }}
            onLoadReview={() => reconciliationMutation.mutate({
              batchId: preview.id,
            })}
            onApply={() => reconciliation && applyMutation.mutate({
              batchId: preview.id,
              review: buildSIM3LONApplyReview(reconciliation),
            }, { onSuccess: close })}
          />
        ) : (
          <div className="space-y-4">
            <Field label={`${supplierLabel()} penerbit`} required>
              <TextInput value={supplierName} onChange={(event) => setSupplierName(event.target.value)}
                list="sim3lon-suppliers" placeholder={`Ketik nama ${supplierLabel()}`} />
              <datalist id="sim3lon-suppliers">
                {supplierOptions.map((name) => <option key={name} value={name} />)}
              </datalist>
            </Field>
            <Field label="Produk" required hint="Pilih LPG 3 kg untuk contoh Penyaluran Harian ini.">
              <SelectInput value={productId} onChange={(event) => setProductId(event.target.value)}>
                <option value="">Pilih produk</option>
                {/* SIM3LON is a subsidy-monitoring feed that only ever concerns
                    the 3kg cylinder -- sorted lightest-first so that option
                    lands on top rather than wherever alphabetical order (which
                    puts "Bright Gas" before "LPG") happens to leave it. */}
                {[...(products.data ?? [])]
                  .sort((a, b) => parseFloat(a.ukuran) - parseFloat(b.ukuran))
                  .map((product) => (
                    <option key={product.id} value={product.id}>{product.nama} · {product.ukuran}</option>
                  ))}
              </SelectInput>
            </Field>
            <Field label="Ekspor Penyaluran Harian" required
              hint="Sheet wajib bernama Penyaluran Harian dan memuat seluruh tanggal dalam satu bulan.">
              <FileDrop file={file} onFile={setFile}
                accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
                hint="XLSX SIM3LON, maksimal 4 MB" disabled={previewMutation.isPending} />
            </Field>
            <p className="text-xs leading-relaxed text-ink-muted">
              Id Registrasi dicocokkan ke kode pangkalan. Sistem tidak membuat pangkalan dari nama
              atau mengarang nomor telepon, lokasi, maupun cabang yang tidak ada di berkas.
            </p>
            <Button className="w-full" disabled={!file || !supplierName.trim() || !productId || previewMutation.isPending}
              onClick={() => file && previewMutation.mutate({ file, supplierName, productId })}>
              {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {previewMutation.isPending ? "Membaca XLSX…" : "Pratinjau perubahan"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function Review({
  preview,
  reconciliation,
  reviewNotice,
  pending,
  onBack,
  onLoadReview,
  onApply,
}: {
  preview: SIM3LONPreview;
  reconciliation: SIM3LONReconciliationPreview | null;
  reviewNotice: string | null;
  pending: boolean;
  onBack: () => void;
  onLoadReview: () => void;
  onApply: () => void;
}) {
  const blocked = !preview.canApply || !reconciliation?.reviewReady || reconciliation.blockers.length > 0;
  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-sm bg-panel-sunk px-3.5 py-2.5">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 text-ink-muted" />
        <div className="min-w-0">
          <p className="truncate text-xs font-semibold text-ink">{preview.fileName}</p>
          <p className="data text-2xs text-ink-muted">{preview.month} · sha256 {preview.checksum.slice(0, 16)}…</p>
          {preview.duplicate && <p className="mt-1 text-xs text-signal-ink">Berkas identik sudah pernah diunggah.</p>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-2 sm:grid-cols-5">
        <Count label="Pangkalan" value={preview.outletCount} />
        <Count label="Alokasi" value={preview.totals.allocationQty} />
        <Count label="Normal" value={preview.totals.normalQty} />
        <Count label="Fakultatif" value={preview.totals.fakultatifQty} />
        <Count label="Sisa" value={preview.totals.remainingQty} />
      </div>

      <div className="rounded-sm border border-line p-3 text-xs text-ink-muted">
        <p><span className="data text-ink">{preview.matchedCount}/{preview.outletCount}</span> pangkalan cocok dengan master.</p>
        <p>{formatNumber(preview.changes.dailyChanged)} nilai harian dan {formatNumber(preview.changes.allocationChanged)} alokasi berubah dari impor yang terakhir diterapkan.</p>
        <p>Fakultatif disimpan sebagai SA terpisah tanpa tanggal; berkas tidak menyatakan tanggal penyalurannya.</p>
      </div>

      {(preview.missingOutlets.length > 0 || preview.issues.length > 0) && (
        <div className="max-h-52 overflow-y-auto rounded-sm bg-rust-soft px-3.5 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-rust-ink">
            <AlertTriangle className="h-3.5 w-3.5" /> Impor belum dapat diterapkan
          </p>
          <ul className="mt-2 space-y-1 text-2xs text-ink">
            {preview.missingOutlets.map((outlet) => (
              <li key={outlet.registrationCode}><span className="data">{outlet.registrationCode}</span> · {outlet.name} — {outlet.reason}</li>
            ))}
            {preview.issues.map((issue, index) => (
              <li key={`${issue.line}-${index}`}>Baris {issue.line}{issue.column ? ` · ${issue.column}` : ""} — {issue.reason}</li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs leading-relaxed text-ink-muted">
        Penerapan memperbarui target alokasi pangkalan, SA Base, SA Fakultatif, dan target harian Base.
        Rencana draf yang masih aman dapat diselaraskan; rencana berjalan tidak pernah ditulis ulang diam-diam.
      </p>

      {reviewNotice && (
        <div className="flex items-start gap-2 rounded-sm border border-signal/30 bg-signal-soft px-3 py-2 text-xs text-signal-ink">
          <RefreshCw className="mt-0.5 h-3.5 w-3.5 shrink-0" />
          <p>{reviewNotice}</p>
        </div>
      )}

      {reconciliation && <ReconciliationLedger review={reconciliation} />}

      <div className="flex gap-2">
        <Button variant="outline" className="flex-1" onClick={onBack} disabled={pending}>Ganti berkas</Button>
        {!reconciliation ? (
          <Button className="flex-1" onClick={onLoadReview} disabled={!preview.canApply || pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending
              ? "Memeriksa rencana…"
              : reviewNotice
                ? "Muat ulang rekonsiliasi"
                : "Tinjau dampak rencana"}
          </Button>
        ) : (
          <Button className="flex-1" onClick={onApply} disabled={blocked || pending}>
            {pending && <Loader2 className="h-4 w-4 animate-spin" />}
            {pending ? "Menerapkan…" : `Terima & terapkan ${formatNumber(preview.outletCount)} pangkalan`}
          </Button>
        )}
      </div>
    </div>
  );
}

const classificationLabel: Record<SIM3LONChangeClassification, string> = {
  increase: "Naik",
  decrease: "Turun",
  zero: "Menjadi nol",
  removed: "Dihapus sumber",
  unchanged: "Tetap",
  local_conflict: "Konflik lokal",
};

function ReconciliationLedger({ review }: { review: SIM3LONReconciliationPreview }) {
  const changed = review.changes.filter((change) => change.classification !== "unchanged");
  const rows = changed.length > 0 ? changed : review.changes;

  return (
    <section aria-label="Rekonsiliasi rencana SIM3LON" className="space-y-3 border-t border-line pt-4">
      <div className="flex flex-wrap items-end justify-between gap-2">
        <div>
          <p className="label text-xs text-ink">Rekonsiliasi sumber</p>
          <p className="mt-1 text-2xs text-ink-muted">
            Sumber dibuat {new Date(review.sourceCreatedAt).toLocaleString("id-ID")}
          </p>
        </div>
        <span className={review.reviewReady
          ? "rounded-full bg-pine-soft px-2 py-1 text-2xs font-semibold text-pine-ink"
          : "rounded-full bg-rust-soft px-2 py-1 text-2xs font-semibold text-rust-ink"}>
          {review.reviewReady ? "Siap diterapkan" : "Perlu tindakan"}
        </span>
      </div>

      {review.blockers.length > 0 && (
        <aside className="border-l-2 border-rust bg-rust-soft px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-rust-ink">
            <ShieldAlert className="h-3.5 w-3.5" /> Penghambat penerapan
          </p>
          <ul className="mt-2 space-y-1 text-2xs text-ink">
            {review.blockers.map((blocker, index) => (
              <li key={`${blocker.code}-${blocker.planId ?? blocker.registrationCode ?? index}`}>
                {blocker.message}
                {blocker.registrationCode ? ` · ${blocker.registrationCode}` : ""}
              </li>
            ))}
          </ul>
        </aside>
      )}

      {rows.length === 0 ? (
        <div className="rounded-sm border border-line bg-panel-sunk px-3 py-4 text-center text-xs text-ink-muted">
          Impor pertama tidak memiliki rencana lama untuk direkonsiliasi.
        </div>
      ) : (
        <div className="max-h-72 space-y-2 overflow-y-auto pr-1">
          {rows.map((change, index) => (
            <article key={`${change.operationalDate}-${change.outletId}-${index}`} className="rounded-sm border border-line bg-panel px-3 py-2.5">
              <div className="flex flex-wrap items-center justify-between gap-2">
                <p className="data text-2xs text-ink-muted">
                  {change.operationalDate} · {change.outletId.slice(0, 8)}
                </p>
                <span className={change.classification === "local_conflict"
                  ? "text-2xs font-semibold text-rust-ink"
                  : "text-2xs font-semibold text-ink"}>
                  {classificationLabel[change.classification]}
                </span>
              </div>
              <div className="mt-2 grid grid-cols-[1fr_auto_1fr_auto_1fr] items-center gap-2 text-center">
                <LedgerValue label="Sumber sebelumnya" value={change.baselineQty} />
                <ArrowRight className="h-3.5 w-3.5 text-ink-faint" />
                <LedgerValue label="Draf saat ini" value={change.currentQty} />
                <ArrowRight className="h-3.5 w-3.5 text-ink-faint" />
                <LedgerValue label="Usulan" value={change.proposedQty} />
              </div>
              {(change.nonDraftDiscrepancy || change.crewAssignmentAffected) && (
                <div className="mt-2 flex flex-wrap gap-1.5">
                  {change.nonDraftDiscrepancy && (
                    <span className="rounded-sm bg-rust-soft px-1.5 py-0.5 text-2xs text-rust-ink">Rencana bukan draf berbeda</span>
                  )}
                  {change.crewAssignmentAffected && (
                    <span className="rounded-sm bg-signal-soft px-1.5 py-0.5 text-2xs text-signal-ink">Penugasan terdampak</span>
                  )}
                </div>
              )}
            </article>
          ))}
        </div>
      )}
    </section>
  );
}

function LedgerValue({ label, value }: { label: string; value: number | null }) {
  return (
    <div className="min-w-0 rounded-sm bg-panel-sunk px-1.5 py-1.5">
      <p className="truncate text-2xs text-ink-muted">{label}</p>
      <p className="data text-sm font-semibold text-ink">{value == null ? "—" : formatNumber(value)}</p>
    </div>
  );
}

function Count({ label, value }: { label: string; value: number }) {
  return <div className="rounded-sm bg-panel-sunk px-2.5 py-2 text-center">
    <p className="data text-sm font-semibold text-ink">{formatNumber(value)}</p>
    <p className="text-2xs text-ink-muted">{label}{label === "Pangkalan" ? "" : ` (${unitLabel()})`}</p>
  </div>;
}
