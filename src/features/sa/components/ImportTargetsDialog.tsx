/**
 * The Base SA import: read the file, review what it would do, then apply it.
 *
 * Two steps, not one, and the second is a separate press. Counts alone are not
 * enough to decide with — "31 dates" says nothing about whether this sheet
 * moves the 24th from 350 to 300, which is the number a penalty is argued from.
 * So the diff is the screen, and applying is the act.
 */
import { useState } from "react";
import { AlertTriangle, FileSpreadsheet, Loader2, Upload } from "lucide-react";
import { Field, FileDrop } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { formatDateId, formatNumber } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { SAImportChange, SAImportDiff, ScheduleAgreement } from "../types";
import { useSAImport } from "../hooks/useSAImport";

interface ImportTargetsDialogProps {
  sa: ScheduleAgreement | null;
  onClose: () => void;
}

export function ImportTargetsDialog({ sa, onClose }: ImportTargetsDialogProps) {
  const [file, setFile] = useState<File | null>(null);
  const { batch, discard, parseMutation, applyMutation } = useSAImport();

  const close = () => {
    setFile(null);
    discard();
    onClose();
  };

  return (
    <Dialog open={!!sa} onOpenChange={(open) => !open && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Impor target harian</DialogTitle>
          <DialogDescription>
            {sa
              ? `Membaca kewajiban harian untuk ${sa.nomorSA}. Tidak ada angka yang ditulis sampai Anda menekan Terapkan.`
              : ""}
          </DialogDescription>
        </DialogHeader>

        {batch ? (
          <ReviewStep
            namaBerkas={batch.namaBerkas}
            checksum={batch.checksum}
            diff={batch.diff}
            isPending={applyMutation.isPending}
            // Closed on success rather than left showing the upload step: the
            // work is done, and a dialog that reopens on the file just applied
            // invites applying it twice.
            onApply={() => applyMutation.mutate(batch.id, { onSuccess: close })}
            onDiscard={() => {
              setFile(null);
              discard();
            }}
          />
        ) : (
          <UploadStep
            file={file}
            onFile={setFile}
            isPending={parseMutation.isPending}
            onParse={() => {
              if (sa && file) parseMutation.mutate({ saId: sa.id, file });
            }}
          />
        )}
      </DialogContent>
    </Dialog>
  );
}

function UploadStep({
  file,
  onFile,
  isPending,
  onParse,
}: {
  file: File | null;
  onFile: (file: File | null) => void;
  isPending: boolean;
  onParse: () => void;
}) {
  return (
    <div className="space-y-4">
      <Field
        label="Berkas Base SA"
        hint="Dua kolom: tanggal dan target. Baris judul boleh ada, boleh tidak."
      >
        <FileDrop
          file={file}
          onFile={onFile}
          accept=".csv,text/csv"
          hint="CSV, maksimal 4 MB"
          label="Letakkan ekspor Base SA di sini atau pilih dari komputer"
          disabled={isPending}
        />
      </Field>

      {/* Stated rather than left to be discovered from an error message: the
          two rules below are the ones a spreadsheet quietly breaks, and the
          person assembling the file can only satisfy them if they know. */}
      <ul className="space-y-1.5 text-xs leading-relaxed text-ink-muted">
        <li>
          Hari libur ditulis <span className="data text-ink">0</span>, bukan
          dikosongkan. Sel kosong akan ditandai sebagai masalah.
        </li>
        <li>
          Tanggal dibaca hari-dulu: <span className="data text-ink">03/09/2026</span> berarti 3
          September. Format <span className="data text-ink">2026-09-03</span> paling aman.
        </li>
        <li>
          Tanggal yang sudah tercatat tetapi tidak ada di berkas tidak diubah.
        </li>
      </ul>

      <Button onClick={onParse} disabled={!file || isPending} className="w-full">
        {isPending ? (
          <Loader2 className="h-4 w-4 animate-spin" />
        ) : (
          <Upload className="h-4 w-4" />
        )}
        {isPending ? "Membaca berkas…" : "Baca berkas"}
      </Button>
    </div>
  );
}

/** The words and colours one change kind gets, in one place. */
const KIND = {
  baru: { label: "Baru", cls: "bg-pine-soft text-pine-ink" },
  berubah: { label: "Berubah", cls: "bg-signal-soft text-signal-ink" },
  tetap: { label: "Tetap", cls: "bg-panel-sunk text-ink-muted" },
} as const;

function ReviewStep({
  namaBerkas,
  checksum,
  diff,
  isPending,
  onApply,
  onDiscard,
}: {
  namaBerkas: string;
  checksum: string;
  diff: SAImportDiff;
  isPending: boolean;
  onApply: () => void;
  onDiscard: () => void;
}) {
  const ditulis = diff.baru + diff.berubah + diff.tetap;

  return (
    <div className="space-y-4">
      <div className="flex items-start gap-3 rounded-sm bg-panel-sunk px-3.5 py-2.5">
        <FileSpreadsheet className="mt-0.5 h-4 w-4 shrink-0 text-ink-muted" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xs font-semibold text-ink">{namaBerkas}</p>
          {checksum && (
            /* The fingerprint of the bytes that were read. It is what makes
               "this is the file we applied" answerable months later, so it is
               shown rather than kept for the record alone. */
            <p className="data truncate text-2xs text-ink-muted" title={checksum}>
              sha256 {checksum.slice(0, 16)}…
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-4 gap-2">
        <Count label="Baru" value={diff.baru} tone="pine" />
        <Count label="Berubah" value={diff.berubah} tone="signal" />
        <Count label="Tetap" value={diff.tetap} tone="ink" />
        <Count label="Dilewati" value={diff.dilewati} tone={diff.dilewati > 0 ? "rust" : "ink"} />
      </div>

      {diff.masalah.length > 0 && (
        <div className="space-y-2 rounded-sm bg-rust-soft px-3.5 py-3">
          <p className="flex items-center gap-2 text-xs font-semibold text-rust-ink">
            <AlertTriangle className="h-3.5 w-3.5" />
            {diff.masalah.length} baris tidak terbaca dan tidak akan ditulis
          </p>
          <ul className="space-y-1">
            {diff.masalah.map((m, i) => (
              <li key={i} className="text-2xs leading-relaxed text-ink">
                <span className="data">Baris {m.baris}</span>
                {m.nilai ? <span className="data"> · {m.nilai}</span> : null} · {m.alasan}
              </li>
            ))}
          </ul>
        </div>
      )}

      {diff.perubahan.length > 0 && (
        <div className="max-h-64 overflow-y-auto rounded-sm border border-line">
          <table className="w-full text-xs">
            {/* Sticky, background and z-index all on the cells rather than the
                row or the section: a `thead` is not a paint target of its own,
                so a background set there sits behind the scrolling rows and the
                header renders underneath the dates passing over it. */}
            <thead>
              <tr className="text-2xs uppercase tracking-wide text-ink-muted">
                {["Tanggal", "Perubahan", "Semula", "Menjadi"].map((h, i) => (
                  <th
                    key={h}
                    className={cn(
                      "sticky top-0 z-10 bg-panel-sunk px-3 py-1.5 font-medium",
                      i < 2 ? "text-left" : "text-right",
                    )}
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {diff.perubahan.map((c) => (
                <ChangeRow key={c.tanggal} change={c} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      <p className="text-xs leading-relaxed text-ink-muted">
        Menerapkan menulis <span className="data text-ink">{formatNumber(ditulis)}</span> tanggal,
        termasuk yang tidak berubah, sehingga semuanya tercatat berasal dari berkas ini. Tanggal yang tidak ada di berkas tidak diubah.
      </p>

      <div className="flex gap-2">
        <Button variant="outline" onClick={onDiscard} disabled={isPending} className="flex-1">
          Ganti berkas
        </Button>
        <Button onClick={onApply} disabled={isPending || ditulis === 0} className="flex-1">
          {isPending && <Loader2 className="h-4 w-4 animate-spin" />}
          {isPending ? "Menerapkan…" : `Terapkan ${formatNumber(ditulis)} tanggal`}
        </Button>
      </div>
    </div>
  );
}

function ChangeRow({ change }: { change: SAImportChange }) {
  const kind = KIND[change.jenis];
  // A restated date DOES have a previous value — the same one — and only the
  // parser knows it, so neither adapter sends it back. Rendering the dash there
  // would say the agreement did not cover the date, which is the opposite of
  // what "tetap" means. The dash belongs to `baru` alone.
  const semula = change.jenis === "baru" ? undefined : (change.dari ?? change.menjadi);
  return (
    <tr className="border-t border-line">
      <td className="px-3 py-1.5 whitespace-nowrap text-ink">
        {formatDateId(change.tanggal)}
      </td>
      <td className="px-3 py-1.5">
        <span className={cn("rounded-sm px-1.5 py-0.5 text-2xs font-medium", kind.cls)}>
          {kind.label}
        </span>
      </td>
      <td className="data px-3 py-1.5 text-right text-ink-muted">
        {semula === undefined ? "—" : formatNumber(semula)}
      </td>
      <td
        className={cn(
          "data px-3 py-1.5 text-right",
          change.jenis === "berubah" ? "font-semibold text-ink" : "text-ink",
        )}
      >
        {formatNumber(change.menjadi)}
        {/* A stated zero is the one number that reads as an empty cell, and the
            difference between the two is the whole reason this table exists. */}
        {change.menjadi === 0 && (
          <span className="ml-1 text-2xs text-ink-muted">nol terencana</span>
        )}
      </td>
    </tr>
  );
}

function Count({
  label,
  value,
  tone,
}: {
  label: string;
  value: number;
  tone: "pine" | "signal" | "rust" | "ink";
}) {
  return (
    <div className="rounded-sm bg-panel-sunk px-3 py-2">
      <p
        className={cn(
          "data text-lg font-semibold",
          tone === "pine" && "text-pine-ink",
          tone === "signal" && "text-signal-ink",
          tone === "rust" && "text-rust-ink",
          tone === "ink" && "text-ink",
        )}
      >
        {formatNumber(value)}
      </p>
      <p className="text-2xs text-ink-muted">{label}</p>
    </div>
  );
}
