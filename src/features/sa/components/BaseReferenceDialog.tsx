/**
 * Unggah Acuan SA: read the SPBE's monthly PDF, check its grid, then save it.
 *
 * The PDF is a baseline the client reads beside SIM3LON -- the month's target
 * on Kuota cabang and Beranda. It never changes the allocation, Penyaluran or
 * planning, and the dialog says so before anything is saved.
 */
import { useState } from "react";
import { AlertTriangle, FileText, Loader2, Upload } from "lucide-react";
import { Field, FileDrop, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { formatNumber } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";
import { cn } from "@/lib/utils";
import { useBaseReferenceUpload } from "../hooks/useBaseReference";
import { currentJakartaMonth, monthFromFileName, monthLabel } from "../lib/period";
import type { BaseReference } from "../types";

export function BaseReferenceDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [file, setFile] = useState<File | null>(null);
  const [month, setMonth] = useState(currentJakartaMonth);
  const { preview, discard, previewMutation, applyMutation } = useBaseReferenceUpload();

  const close = () => {
    setFile(null);
    setMonth(currentJakartaMonth());
    previewMutation.reset();
    discard();
    onClose();
  };

  const pickFile = (picked: File | null) => {
    setFile(picked);
    previewMutation.reset();
    // The month is printed only in the file name; suggest it, the admin confirms.
    const named = picked ? monthFromFileName(picked.name) : null;
    if (named) setMonth(named);
  };

  const problems =
    previewMutation.error instanceof ApiError && previewMutation.error.violations.length > 0
      ? previewMutation.error.violations.map((violation) => violation.message)
      : [];

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Unggah Acuan SA</DialogTitle>
          <DialogDescription>
            PDF bulanan dari SPBE berisi target harian. Totalnya menjadi target bulan ini di Kuota cabang dan
            Beranda. Alokasi dan penyaluran tetap dari SIM3LON.
          </DialogDescription>
        </DialogHeader>

        {preview ? (
          <ReviewStep
            preview={preview}
            isPending={applyMutation.isPending}
            onSave={() => applyMutation.mutate(preview.id, { onSuccess: close })}
            onBack={() => {
              setFile(null);
              discard();
            }}
          />
        ) : (
          <div className="space-y-4">
            <Field label="File Acuan SA">
              <FileDrop
                file={file}
                onFile={pickFile}
                accept=".pdf,application/pdf"
                hint="PDF, maksimal 4 MB"
                label="Letakkan PDF Acuan SA di sini atau pilih dari komputer"
                disabled={previewMutation.isPending}
              />
            </Field>
            <Field
              label="Bulan"
              htmlFor="base-reference-month"
              hint="PDF tidak mencantumkan bulannya. Terisi dari nama file bila tertulis di sana; periksa sebelum membaca."
            >
              <TextInput
                id="base-reference-month"
                type="month"
                value={month}
                onChange={(event) => setMonth(event.target.value)}
                disabled={previewMutation.isPending}
              />
            </Field>

            {problems.length > 0 && (
              <div className="space-y-2 rounded-sm bg-rust-soft px-3.5 py-3">
                <p className="flex items-center gap-2 text-xs font-semibold text-rust-ink">
                  <AlertTriangle className="h-3.5 w-3.5" />
                  PDF ini belum dapat disimpan
                </p>
                <ul className="space-y-1">
                  {problems.map((problem) => (
                    <li key={problem} className="text-2xs leading-relaxed text-ink">{problem}</li>
                  ))}
                </ul>
              </div>
            )}

            <Button
              onClick={() => file && month && previewMutation.mutate({ file, month })}
              disabled={!file || !month || previewMutation.isPending}
              className="w-full"
            >
              {previewMutation.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <Upload className="h-4 w-4" />}
              {previewMutation.isPending ? "Membaca PDF…" : "Baca PDF"}
            </Button>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

function ReviewStep({ preview, isPending, onSave, onBack }: {
  preview: BaseReference;
  isPending: boolean;
  onSave: () => void;
  onBack: () => void;
}) {
  const unit = unitLabel();
  const [year, monthNumber] = preview.periodMonth.split("-").map(Number);
  const dayCount = preview.rows[0]?.days.length ?? 0;
  const isSunday = (day: number) => new Date(year, monthNumber - 1, day).getDay() === 0;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-sm bg-panel-sunk px-3.5 py-2.5">
        <FileText className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{preview.fileName}</p>
          <p className="text-2xs text-ink-muted">{monthLabel(preview.periodMonth)}</p>
        </div>
        <p className="data shrink-0 text-right text-lg font-semibold text-ink">
          {formatNumber(preview.totalQty)} <span className="text-xs font-normal text-ink-muted">{unit}</span>
        </p>
      </div>

      {/* Scrolls inside the dialog on a phone rather than widening the page. */}
      <div className="overflow-x-auto rounded-sm border border-line">
        <table className="w-full min-w-[720px] border-collapse text-2xs">
          <thead>
            <tr className="bg-panel-sunk text-ink-muted">
              <th className="px-2 py-1.5 text-left font-medium">SPBE</th>
              {Array.from({ length: dayCount }, (_, index) => (
                <th
                  key={index}
                  className={cn("data px-0.5 py-1.5 text-center font-medium", isSunday(index + 1) && "text-rust-ink")}
                >
                  {index + 1}
                </th>
              ))}
              <th className="px-2 py-1.5 text-right font-medium">Total</th>
            </tr>
          </thead>
          <tbody>
            {preview.rows.map((row) => (
              <tr key={row.supplierName} className="border-t border-line">
                <td className="whitespace-nowrap px-2 py-1.5 font-medium text-ink">{row.supplierName}</td>
                {row.days.map((qty, index) => (
                  <td key={index} className={cn("data px-0.5 py-1.5 text-center", qty === 0 ? "text-ink-muted" : "text-ink")}>
                    {qty === 0 ? "–" : formatNumber(qty)}
                  </td>
                ))}
                <td className="data px-2 py-1.5 text-right font-semibold text-ink">{formatNumber(row.totalQty)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <ul className="space-y-1.5 text-xs leading-relaxed text-ink-muted">
        <li>Sel kosong di PDF, misalnya hari Minggu, tercatat 0 (–).</li>
        {preview.currentTotalQty !== null && (
          <li className="text-ink">
            Menggantikan Acuan SA {monthLabel(preview.periodMonth)} yang tersimpan (
            <span className="data">{formatNumber(preview.currentTotalQty)}</span> {unit}).
          </li>
        )}
        <li>Alokasi, penyaluran dan rencana tetap mengikuti SIM3LON; tidak ada yang berubah selain target pembanding.</li>
      </ul>

      <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
        <Button variant="outline" onClick={onBack} disabled={isPending}>
          Pilih file lain
        </Button>
        <Button onClick={onSave} disabled={isPending}>
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Menyimpan…" : "Simpan Acuan SA"}
        </Button>
      </div>
    </div>
  );
}
