import { useState } from "react";
import { AlertTriangle, CheckCircle2, RotateCcw, Truck } from "lucide-react";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, TextInput, TextareaInput } from "@/components/common/Field";
import { DateInput } from "@/components/common/DateInput";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { formatDateId, formatNumber, formatTime } from "@/lib/format";
import { formatCurrency } from "@/lib/utils";
import { outletLabel, unitLabel } from "@/lib/lexicon";
import type { RunDocument, RunSummary } from "../types";
import type {
  CloseRunInput,
  CloseRunResult,
  RedeliverInput,
  RedeliveryResult,
  RunCount,
} from "../api/monitoringApi";
import { countsToSend, openDocuments, redeliverable, today, tomorrow } from "../lib/runClose";

type Mutation<TArgs, TResult> = {
  mutate: (args: TArgs, options?: { onSuccess?: (result: TResult) => void }) => void;
  isPending: boolean;
  variables?: TArgs;
};

/**
 * The day's runs, and closing them.
 *
 * Billing happens at dispatch, for everything loaded. Closing a run is where
 * the office confirms what each pangkalan kept: the tabung that came back are
 * credited to the pangkalan, what it paid for them is held as its deposit,
 * and they go back into stock.
 */
export function RunClosePanel({
  runs,
  closeRun,
  bookReturn,
  redeliver,
}: {
  runs: RunSummary[];
  closeRun: Mutation<CloseRunInput, CloseRunResult>;
  bookReturn: Mutation<string, unknown>;
  redeliver: Mutation<RedeliverInput, RedeliveryResult>;
}) {
  const [closing, setClosing] = useState<RunSummary | null>(null);
  const [carrying, setCarrying] = useState<RunDocument | null>(null);

  if (runs.length === 0) return null;

  return (
    <Panel>
      <PanelHeader
        title="Rit"
        hint="Tutup rit setelah truk kembali: jumlah diterima dikonfirmasi, tabung yang kembali dikreditkan dan masuk stok lagi."
      />
      <ul className="divide-y divide-line">
        {runs.map((run) => (
          <RunLine
            key={run.id}
            run={run}
            onClose={() => setClosing(run)}
            onRedeliver={setCarrying}
            bookReturn={bookReturn}
          />
        ))}
      </ul>

      {carrying && (
        <RedeliverDialog
          doc={carrying}
          pending={redeliver.isPending}
          onCancel={() => setCarrying(null)}
          onSubmit={(input) => redeliver.mutate(input, { onSuccess: () => setCarrying(null) })}
        />
      )}

      {closing && (
        <CloseRunDialog
          run={closing}
          pending={closeRun.isPending}
          onCancel={() => setClosing(null)}
          onSubmit={(input, done) => closeRun.mutate(input, { onSuccess: done })}
        />
      )}
    </Panel>
  );
}

function runTitle(run: RunSummary) {
  return `${run.ritKe ? `Rit ${run.ritKe}` : "Rit"} · ${run.plat} · ${run.driver}`;
}

function runPlanDate(run: RunSummary) {
  return run.tanggalRencana ? formatDateId(`${run.tanggalRencana}T00:00:00`) : undefined;
}

function RunPlanLabel({ run }: { run: RunSummary }) {
  const tanggal = runPlanDate(run);
  if (!run.nomorRencana && !tanggal) return null;

  return (
    <span className="block break-words text-xs font-medium text-ink">
      {run.nomorRencana && <>Rencana <span className="data">{run.nomorRencana}</span></>}
      {run.nomorRencana && tanggal && " · "}
      {tanggal && <time dateTime={run.tanggalRencana}>{tanggal}</time>}
    </span>
  );
}

function runEventTime(timestamp: string, planDate: string | undefined) {
  const day = formatDateId(timestamp);
  const clock = formatTime(timestamp);
  return day === planDate ? clock : `${day}, ${clock}`;
}

function RunLine({
  run,
  onClose,
  onRedeliver,
  bookReturn,
}: {
  run: RunSummary;
  onClose: () => void;
  onRedeliver: (doc: RunDocument) => void;
  bookReturn: Mutation<string, unknown>;
}) {
  const selesai = run.dokumen.filter((d) => d.status === "Selesai" || d.status === "Tertunda").length;
  const tertunda = run.dokumen.filter((d) => d.koreksiTertunda);
  const kembali = run.dokumen.filter((d) => redeliverable(d) || d.kirimUlang);
  const planDate = runPlanDate(run);

  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:justify-between sm:px-5">
      <div className="min-w-0">
        <p className="break-words text-sm font-medium text-ink">{runTitle(run)}</p>
        <RunPlanLabel run={run} />
        <p className="text-xs text-ink-muted">
          {run.berangkat ? `Berangkat ${runEventTime(run.berangkat, planDate)}` : "Belum berangkat"}
          {run.kembali ? ` · Ditutup ${runEventTime(run.kembali, planDate)}` : ""}
          {` · ${selesai}/${run.dokumen.length} surat jalan selesai`}
        </p>
        {tertunda.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {tertunda.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center gap-2 text-xs text-ink">
                <AlertTriangle className="h-3.5 w-3.5 shrink-0 text-signal-ink" aria-hidden />
                <span>
                  Koreksi tagihan tertunda: <span className="data">{doc.kode}</span> ({doc.outlet},{" "}
                  {formatNumber(doc.dimuat - doc.diterima)} {unitLabel()} kembali)
                </span>
                <CanAccess permission={PERMISSIONS.CREDIT_NOTES_CREATE}>
                  <Button
                    size="xs"
                    variant="outline"
                    disabled={bookReturn.isPending && bookReturn.variables === doc.id}
                    onClick={() => bookReturn.mutate(doc.id)}
                  >
                    <RotateCcw className="h-3 w-3" />
                    Coba lagi
                  </Button>
                </CanAccess>
              </div>
            ))}
          </div>
        )}
        {kembali.length > 0 && (
          <div className="mt-2 space-y-1.5">
            {kembali.map((doc) => (
              <div key={doc.id} className="flex flex-wrap items-center gap-2 text-xs text-ink">
                <Truck className="h-3.5 w-3.5 shrink-0 text-ink-muted" aria-hidden />
                <span>
                  {formatNumber(doc.dimuat - doc.diterima)} {unitLabel()} kembali dari {doc.outlet} (
                  <span className="data">{doc.kode}</span>)
                  {doc.kirimUlang ? (
                    <span className="text-ink-muted"> · dijadwalkan ulang di {doc.kirimUlang}</span>
                  ) : null}
                </span>
                {!doc.kirimUlang && (
                  <CanAccess permission={PERMISSIONS.DISTRIBUTION_CREATE}>
                    <Button size="xs" variant="outline" onClick={() => onRedeliver(doc)}>
                      Kirim ulang
                    </Button>
                  </CanAccess>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
      <div className="flex shrink-0 items-center gap-2">
        {run.kembali ? (
          <StatusBadge variant="success" label="Ditutup" />
        ) : run.berangkat ? (
          <StatusBadge variant="process" label="Di jalan" />
        ) : (
          <StatusBadge variant="draft" label="Belum berangkat" />
        )}
        {run.bisaDitutup && (
          <CanAccess permission={PERMISSIONS.DISTRIBUTION_EDIT}>
            <Button size="sm" onClick={onClose}>
              Tutup rit
            </Button>
          </CanAccess>
        )}
      </div>
    </li>
  );
}

type Draft = Record<string, { diterima: number; kembali: number; catatan: string }>;

function draftFrom(dokumen: RunDocument[]): Draft {
  return Object.fromEntries(
    dokumen.map((d) => [
      d.id,
      // A return the driver never filed is what was still on the truck --
      // the same rule the server applies to a drop nobody corrects.
      { diterima: d.diterima, kembali: d.dimuat - d.diterima, catatan: "" },
    ]),
  );
}

function CloseRunDialog({
  run,
  pending,
  onCancel,
  onSubmit,
}: {
  run: RunSummary;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: CloseRunInput, done: (result: CloseRunResult) => void) => void;
}) {
  const [draft, setDraft] = useState<Draft>(() => draftFrom(run.dokumen));
  const [result, setResult] = useState<CloseRunResult | null>(null);

  const open = openDocuments(run.dokumen);
  const counts: RunCount[] = countsToSend(run.dokumen, draft);
  // A changed figure issues a credit note, so it needs a reason; the server
  // refuses one without (CORRECTION_NEEDS_REASON).
  const needsReason = (d: RunSummary["dokumen"][number]) =>
    draft[d.id].diterima !== d.diterima && draft[d.id].catatan.trim().length < 3;
  const invalid = run.dokumen.filter((d) => {
    const row = draft[d.id];
    return row.diterima < 0 || row.kembali < 0 || row.diterima + row.kembali !== d.dimuat || needsReason(d);
  });
  const kembaliTotal = run.dokumen.reduce((sum, d) => sum + draft[d.id].kembali, 0);

  const set = (id: string, field: "diterima" | "kembali", value: number, dimuat: number) =>
    setDraft((current) => {
      const safe = Number.isFinite(value) ? Math.max(0, Math.min(dimuat, Math.trunc(value))) : 0;
      // Typing one figure fills in the other: delivered + returned is always
      // what was loaded, so the second is never a separate guess.
      const other = dimuat - safe;
      return {
        ...current,
        [id]:
          field === "diterima"
            ? { ...current[id], diterima: safe, kembali: other }
            : { ...current[id], kembali: safe, diterima: other },
      };
    });

  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>{result ? "Rit ditutup" : `Tutup ${runTitle(run)}`}</DialogTitle>
          <DialogDescription>
            <RunPlanLabel run={run} />
            {result
              ? "Jumlah yang dikonfirmasi dan koreksi tagihannya."
              : `Periksa jumlah yang diterima tiap ${outletLabel()}. Tagihan sudah terbit saat berangkat untuk seluruh muatan; ${unitLabel()} yang kembali dikreditkan, uangnya menjadi titipan ${outletLabel()}, dan ${unitLabel()}-nya masuk stok lagi.`}
          </DialogDescription>
        </DialogHeader>

        {result ? (
          <ClosedSummary result={result} />
        ) : (
          <>
            {open.length > 0 && (
              <p className="rounded-md border border-line bg-rust-soft px-3 py-2 text-xs text-ink">
                {open.length} surat jalan belum selesai ({open.map((d) => d.kode).join(", ")}). Selesaikan
                atau catat kendalanya dulu, lalu tutup rit.
              </p>
            )}
            {/* A grid, not a table: on a phone each surat jalan stacks (name,
                then the three counts side by side, each labelled), because four
                columns at 360 px squeeze the name and the inputs to nothing.
                The dialog itself scrolls, so the list only scrolls on its own
                where there is room for two scrollers. */}
            <div className="-mx-1 text-sm sm:max-h-[55vh] sm:overflow-auto">
              <div
                aria-hidden
                className="label hidden grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem] gap-3 px-2 py-1.5 text-2xs text-ink-muted sm:grid"
              >
                <span>Surat jalan</span>
                <span className="text-right">Dimuat</span>
                <span className="text-right">Diterima</span>
                <span className="text-right">Kembali</span>
              </div>
              <ul className="divide-y divide-line">
                {run.dokumen.map((d) => {
                  const row = draft[d.id];
                  const changed = row.diterima !== d.diterima || row.kembali !== d.dimuat - d.diterima;
                  const locked = d.status === "Antrian" || d.status === "Proses";
                  return (
                    <li
                      key={d.id}
                      className="grid grid-cols-3 gap-x-3 gap-y-2 px-2 py-3 sm:grid-cols-[minmax(0,1fr)_4.5rem_6rem_6rem] sm:items-start sm:py-2"
                    >
                      <div className="col-span-3 min-w-0 sm:col-span-1">
                        <p className="font-medium text-ink">{d.outlet}</p>
                        <p className="break-words text-xs text-ink-muted">
                          <span className="data">{d.kode}</span> · {d.produk}
                          {d.status === "Tertunda" ? " · gagal" : ""}
                        </p>
                      </div>
                      <div className="sm:pt-2 sm:text-right">
                        <span className="label block text-2xs text-ink-muted sm:hidden">Dimuat</span>
                        <span className="data">{formatNumber(d.dimuat)}</span>
                      </div>
                      <label className="block">
                        <span className="label mb-1 block text-2xs text-ink-muted sm:hidden">Diterima</span>
                        <TextInput
                          aria-label={`Diterima ${d.kode}`}
                          type="number"
                          inputMode="numeric"
                          mono
                          min={0}
                          max={d.dimuat}
                          disabled={locked}
                          className="w-full text-right"
                          value={row.diterima}
                          onChange={(e) => set(d.id, "diterima", Number(e.target.value), d.dimuat)}
                        />
                      </label>
                      <label className="block">
                        <span className="label mb-1 block text-2xs text-ink-muted sm:hidden">Kembali</span>
                        <TextInput
                          aria-label={`Kembali ${d.kode}`}
                          type="number"
                          inputMode="numeric"
                          mono
                          min={0}
                          max={d.dimuat}
                          disabled={locked}
                          className="w-full text-right"
                          value={row.kembali}
                          onChange={(e) => set(d.id, "kembali", Number(e.target.value), d.dimuat)}
                        />
                      </label>
                      {changed && (
                        <div className="col-span-3 sm:col-span-4">
                          <TextareaInput
                            aria-label={`Alasan koreksi ${d.kode}`}
                            aria-required
                            invalid={needsReason(d)}
                            rows={2}
                            placeholder="Alasan koreksi (contoh: sopir salah ketik)"
                            value={row.catatan}
                            onChange={(e) =>
                              setDraft((current) => ({
                                ...current,
                                [d.id]: { ...current[d.id], catatan: e.target.value },
                              }))
                            }
                          />
                          {needsReason(d) && (
                            <p className="mt-1 text-xs text-rust-ink">
                              Wajib diisi: koreksi ini menerbitkan nota kredit.
                            </p>
                          )}
                        </div>
                      )}
                    </li>
                  );
                })}
              </ul>
            </div>
            <p className="text-xs text-ink-muted">
              Total kembali ke gudang:{" "}
              <span className="data text-ink">{formatNumber(kembaliTotal)}</span> {unitLabel()}.
              {counts.length > 0 && ` ${counts.length} surat jalan dikoreksi.`}
            </p>
          </>
        )}

        <DialogFooter>
          {result ? (
            <Button onClick={onCancel}>Selesai</Button>
          ) : (
            <>
              <Button variant="outline" onClick={onCancel}>
                Batal
              </Button>
              <Button
                disabled={pending || open.length > 0 || invalid.length > 0}
                onClick={() => onSubmit({ runId: run.id, koreksi: counts }, setResult)}
              >
                {pending ? "Menutup…" : "Konfirmasi dan tutup rit"}
              </Button>
            </>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function ClosedSummary({ result }: { result: CloseRunResult }) {
  const credited = result.dokumen.filter((d) => d.kembali > 0);
  const pending = result.dokumen.filter((d) => d.tertunda);
  return (
    <div className="space-y-3 text-sm">
      {credited.length === 0 ? (
        <p className="flex items-center gap-2 text-ink">
          <CheckCircle2 className="h-4 w-4 text-pine" aria-hidden />
          Semua muatan diterima. Tidak ada yang dikreditkan.
        </p>
      ) : (
        <ul className="divide-y divide-line rounded-md border border-line">
          {credited.map((d) => (
            <li key={d.id} className="flex flex-col gap-0.5 px-3 py-2 sm:flex-row sm:justify-between">
              <span>
                <span className="font-medium text-ink">{d.outlet ?? d.kode}</span>{" "}
                <span className="text-ink-muted">
                  · {formatNumber(d.kembali)} {unitLabel()} kembali
                </span>
              </span>
              {d.tertunda ? (
                <span className="text-xs text-rust-ink">Koreksi tertunda: {d.alasan}</span>
              ) : (
                <span className="text-xs text-ink-muted">
                  {d.notaKredit} · {formatCurrency(d.nilaiKredit)}
                  {d.keTitipan > 0 && ` · ${formatCurrency(d.keTitipan)} ke titipan`}
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      {pending.length > 0 && (
        <p className="text-xs text-ink-muted">
          Rit sudah ditutup. Koreksi yang tertunda bisa dicoba lagi dari daftar rit oleh bagian
          keuangan.
        </p>
      )}
      {result.rencanaSelesai && (
        <p className="text-xs text-ink-muted">Ini rit terakhir. Rencana distribusi selesai.</p>
      )}
    </div>
  );
}

function RedeliverDialog({
  doc,
  pending,
  onCancel,
  onSubmit,
}: {
  doc: RunDocument;
  pending: boolean;
  onCancel: () => void;
  onSubmit: (input: RedeliverInput) => void;
}) {
  const [tanggal, setTanggal] = useState(tomorrow);
  const jumlah = doc.dimuat - doc.diterima;
  return (
    <Dialog open onOpenChange={(next) => !next && onCancel()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kirim ulang ke {doc.outlet}</DialogTitle>
          <DialogDescription>
            {formatNumber(jumlah)} {unitLabel()} dari <span className="data">{doc.kode}</span> sudah
            dikreditkan dan uangnya menjadi titipan {outletLabel()}. Kirim ulang menambahkan baris ke
            rencana pada tanggal ini tanpa memakai kuota lagi; tagihannya dibayar dari titipan saat
            berangkat.
          </DialogDescription>
        </DialogHeader>
        <Field label="Tanggal kirim" htmlFor="kirim-ulang-tanggal" required>
          <DateInput
            id="kirim-ulang-tanggal"
            value={tanggal}
            min={today()}
            onChange={(e) => setTanggal(e.target.value)}
          />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onCancel}>
            Batal
          </Button>
          <Button disabled={pending || !tanggal} onClick={() => onSubmit({ deliveryId: doc.id, tanggal })}>
            {pending ? "Menjadwalkan…" : "Jadwalkan kirim ulang"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
