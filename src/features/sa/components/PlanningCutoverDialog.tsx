import { useState } from "react";
import { AlertTriangle, CalendarClock, Loader2, ShieldAlert } from "lucide-react";
import { Field, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { formatNumber, formatRupiah } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";
import { setPlanningCutover } from "../api/saApi";
import type { PlanningCutoverReport } from "../types";

/**
 * Sets the date the branch starts planning in the system.
 *
 * A dry run always comes first and the apply button only exists beside its
 * report: the write moves every affected Base quota by the SIM3LON days before
 * the date, and nobody should confirm that number without having seen it.
 */
export function PlanningCutoverDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState("");
  const [report, setReport] = useState<PlanningCutoverReport | null>(null);
  const close = () => {
    setDate("");
    setReport(null);
    onClose();
  };

  const dryRun = useDeskMutation({
    mutationFn: (value: string) => setPlanningCutover(value, true),
    errorTitle: "Gagal memeriksa dampak",
    invalidate: [],
    onDone: (result) => setReport(result),
  });
  const commit = useDeskMutation({
    mutationFn: (value: string) => setPlanningCutover(value, false),
    errorTitle: "Tanggal mulai sistem gagal diterapkan",
    success: (result) => ({
      title: "Tanggal mulai sistem diterapkan",
      description: `Penyaluran sebelum ${result.planningStartDate} kini tercatat sebagai saldo awal kuota.`,
    }),
    onDone: () => close(),
  });

  const reviewed = report !== null && report.planningStartDate === date;
  const blocked = !reviewed || report.blockers.length > 0;
  const pending = dryRun.isPending || commit.isPending;

  return (
    <Dialog open={open} onOpenChange={(next) => !next && close()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tanggal mulai sistem</DialogTitle>
          <DialogDescription>
            Hari pertama cabang ini merencanakan penyaluran di sistem. Penyaluran SIM3LON sebelum
            tanggal ini dianggap sudah terjadi di luar sistem dan dicatat sebagai saldo awal kuota Base.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Tanggal mulai" required
            hint="Biasanya tanggal go-live. Mengulang tanggal yang sama tidak menggeser kuota dua kali.">
            <TextInput type="date" value={date} onChange={(event) => { setDate(event.target.value); setReport(null); }} />
          </Field>

          {reviewed && <CutoverReport report={report} />}

          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" disabled={!date || pending}
              onClick={() => dryRun.mutate(date)}>
              {dryRun.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {dryRun.isPending ? "Memeriksa…" : "Periksa dampak"}
            </Button>
            <Button className="flex-1" disabled={blocked || pending} onClick={() => commit.mutate(date)}>
              {commit.isPending && <Loader2 className="h-4 w-4 animate-spin" />}
              {commit.isPending ? "Menerapkan…" : "Terapkan tanggal mulai"}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

function CutoverReport({ report }: { report: PlanningCutoverReport }) {
  return (
    <section aria-label="Dampak tanggal mulai sistem" className="space-y-3 border-t border-line pt-4">
      <p className="text-2xs text-ink-muted">
        Saat ini:{" "}
        <span className="data text-ink">{report.currentPlanningStartDate ?? "belum diatur"}</span>
      </p>

      {report.blockers.length > 0 && (
        <aside className="border-l-2 border-rust bg-rust-soft px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-rust-ink">
            <ShieldAlert className="h-3.5 w-3.5" /> Belum dapat diterapkan
          </p>
          <ul className="mt-2 space-y-1 text-2xs text-ink">
            {report.blockers.map((blocker, index) => (
              <li key={`${blocker.code}-${blocker.planId ?? index}`}>{blocker.message}</li>
            ))}
          </ul>
        </aside>
      )}

      {report.warnings.length > 0 && (
        <aside className="border-l-2 border-signal bg-signal-soft px-3 py-2.5">
          <p className="flex items-center gap-2 text-xs font-semibold text-signal-ink">
            <AlertTriangle className="h-3.5 w-3.5" /> Perlu ditangani sebelum unggah ulang berikutnya
          </p>
          <ul className="mt-2 space-y-1 text-2xs text-ink">
            {report.warnings.map((warning, index) => (
              <li key={`${warning.code}-${warning.planId ?? index}`}>{warning.message}</li>
            ))}
          </ul>
        </aside>
      )}

      {report.scopes.length === 0 ? (
        <div className="flex items-center gap-2 rounded-sm border border-line bg-panel-sunk px-3 py-3 text-xs text-ink-muted">
          <CalendarClock className="h-4 w-4 shrink-0" />
          Belum ada impor SIM3LON sebelum tanggal ini. Tanggal tetap dicatat, dan impor berikutnya
          langsung memisahkan saldo awal.
        </div>
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full min-w-[40rem] text-xs">
            <thead>
              <tr className="border-b border-line text-left text-2xs text-ink-muted">
                <th className="py-1.5 pr-2 font-medium">Bulan</th>
                <th className="py-1.5 pr-2 text-right font-medium">Kuota Base</th>
                <th className="py-1.5 pr-2 text-right font-medium">Saldo awal</th>
                <th className="py-1.5 pr-2 text-right font-medium">Dialokasikan</th>
                <th className="py-1.5 pr-2 text-right font-medium">Pendapatan</th>
                <th className="py-1.5 text-right font-medium">Pangkalan</th>
              </tr>
            </thead>
            <tbody>
              {report.scopes.map((scope) => (
                <tr key={`${scope.productId}-${scope.periodMonth}`} className="border-b border-line/60">
                  <td className="data py-2 pr-2 text-ink">{scope.periodMonth}</td>
                  <td className="data py-2 pr-2 text-right text-ink">{formatNumber(scope.quotaTotal)}</td>
                  <td className="data py-2 pr-2 text-right text-ink">
                    <Movement before={scope.openingBefore} after={scope.openingAfter} />
                  </td>
                  <td className="data py-2 pr-2 text-right text-ink">
                    <Movement before={scope.allocatedBefore} after={scope.allocatedAfter} />
                  </td>
                  <td className="data py-2 pr-2 text-right text-ink">
                    <Movement before={scope.revenueBefore} after={scope.revenueAfter} format={formatRupiah} />
                  </td>
                  <td className="data py-2 text-right text-ink-muted">{formatNumber(scope.outlets.length)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-2 text-2xs text-ink-muted">
            Angka dalam {unitLabel()}. Terpakai bergerak sama dengan saldo awal. Pendapatan dicatat ke
            Buku Besar per hari penyaluran (Bank / Penjualan, termasuk PPN bila PKP) dengan harga jual yang
            berlaku pada hari itu; HPP tidak dicatat.
          </p>
        </div>
      )}
    </section>
  );
}

function Movement({ before, after, format = formatNumber }: {
  before: number;
  after: number;
  format?: (value: number) => string;
}) {
  if (before === after) return <>{format(after)}</>;
  return (
    <>
      <span className="text-ink-muted">{format(before)} → </span>
      <span className="font-semibold">{format(after)}</span>
    </>
  );
}
