import { useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import {
  Camera,
  MapPin,
  Navigation,
  PackageCheck,
  Phone,
  Play,
  Crosshair,
  ShieldQuestion,
  Route,
  TriangleAlert,
} from "lucide-react";
import { scopeKey } from "@/lib/scope";
import { useAuthStore } from "@/features/auth/store/authStore";
import { DELIVERY_PHOTO_ACCEPT } from "@/features/attachments/api/attachmentApi";
import { PERMISSIONS } from "@/features/rbac/permissions";
import {
  arriveStop,
  checkLocation,
  completeStop,
  departStop,
  getMyRun,
  holdStop,
} from "@/features/sopir/api/sopirApi";
import type { RunStop, StopFiling, StopLine } from "@/features/sopir/types";
import { GEO_STATUS_LABEL, formatDistance } from "@/lib/geo";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useOutbox } from "@/features/sopir/hooks/useOutbox";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, Meter, Skeleton } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Field, TextInput, TextareaInput, Toggle } from "@/components/common/Field";
import { useGpsStream } from "@/features/sopir/hooks/useGpsStream";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateLong, formatNumber, formatTime } from "@/lib/format";
import { outletLabel, unitLabel, unitLabelTitle } from "@/lib/lexicon";

/**
 * Rute Saya — the sopir's console.
 *
 * The only screen in this application designed to be read one-handed, in a cab,
 * in daylight: one card per stop, in the order they are driven, and exactly
 * three things that can be recorded at each. Everything the desk cares about —
 * quota, margin, receivables — is deliberately absent, because a driver holding
 * a phone at a outlet gate cannot act on any of it.
 *
 * What is recorded here is not a status update. `realisasi` is the realised
 * distribution -- what each pangkalan actually accepted -- and this page is the
 * only place that number is known first-hand.
 *
 * Written for drivers who are not used to apps: every button says what it
 * does, every filing answers with a sentence, and nothing a driver sees is an
 * error code.
 */
export function SopirPage() {
  const user = useAuthStore((s) => s.user);

  const driverId = user?.driverId ?? "";

  const [completing, setCompleting] = useState<RunStop | null>(null);
  const [holding, setHolding] = useState<RunStop | null>(null);
  const [form, setForm] = useState<{
    // NaN while a quantity box is empty: an empty box is not zero, and
    // submitting it as zero would record a drop nobody counted.
    lines: { productId: string; realisasi: number; kembali: number; kembaliDiubah: boolean }[];
    diterimaOleh: string;
    catatan: string;
    foto: File | null;
  }>({ lines: [], diterimaOleh: "", catatan: "", foto: null });
  const canAttachPhoto = useAuthStore((s) => s.hasPermission(PERMISSIONS.DELIVERY_PROOFS_CREATE));
  // A driver tapping the pangkalan's name used to land on "di luar akses Anda".
  const canOpenOutlet = useAuthStore((s) => s.hasPermission(PERMISSIONS.OUTLETS_VIEW));
  const [alasan, setAlasan] = useState("");
  // Where the phone is compared with the pangkalan being closed. Undefined
  // while the GPS is still answering; a warning, never a gate.
  const [lokasiTutup, setLokasiTutup] = useState<
    Awaited<ReturnType<typeof checkLocation>> | "mencari"
  >(undefined);

  const run = useQuery({
    queryKey: [...scopeKey(), "sopir-run", driverId],
    queryFn: () => getMyRun(driverId),
    // The desk moves drops too, and a stale card invites a double delivery.
    refetchInterval: 30_000,
  });

  // The run tracker: off by default, the driver's own choice, offered only
  // when there is somewhere left to drive to today. `run.data.rekamLokasi` is
  // the agency's own switch, resolved server-side because this account has no
  // permission to read tenant settings directly.
  //
  // Never on the kernet's phone: the route comes from the driver's, and two
  // phones in one cab would file the same trip twice.
  const trackingOffered =
    !!run.data?.rekamLokasi &&
    run.data.peran !== "Kernet" &&
    (run.data?.stops.some((s) => s.status !== "Selesai" && s.status !== "Tertunda") ?? false);
  const tripKey = run.data?.driver
    ? `${run.data.driver.id}:${run.data.tanggal}`
    : null;
  const gpsStream = useGpsStream({ enabled: trackingOffered, tripKey });
  const outbox = useOutbox();
  const [confirmDiscard, setConfirmDiscard] = useState<string | null>(null);

  // A filing with no signal is saved on the phone and sent later; the toast
  // says so instead of claiming the office already has it.
  const savedOffline = (kode: string) => ({
    tone: "warning" as const,
    title: `${kode} tersimpan di perangkat`,
    description: "Belum ada sinyal. Akan dikirim otomatis begitu sinyal kembali.",
  });

  const departMutation = useDeskMutation({
    mutationFn: (deliveryId: string) => departStop(deliveryId),
    errorTitle: "Gagal mencatat keberangkatan",
    success: (d) =>
      d.tertunda
        ? savedOffline(d.kode)
        : {
            title: `${d.kode} berangkat`,
            description: "Kantor sekarang melihat armada Anda dalam perjalanan.",
          },
  });

  const arriveMutation = useDeskMutation({
    mutationFn: (deliveryId: string) => arriveStop(deliveryId),
    errorTitle: "Gagal mencatat kedatangan",
    success: (d) =>
      d.tertunda
        ? savedOffline(d.kode)
        : d.lokasi?.verdict === "jauh"
          ? {
              tone: "warning" as const,
              title: `${d.kode} tiba di lokasi`,
              description: `Posisi ponsel Anda ${formatDistance(d.lokasi.jarakMeter ?? 0)} dari ${outletLabel()}. Pastikan Anda sudah di lokasi yang benar.`,
            }
          : {
              title: `${d.kode} tiba di lokasi`,
              description: "Waktu tunggu di lokasi mulai dihitung dari sekarang.",
            },
  });

  const completeMutation = useDeskMutation({
    mutationFn: completeStop,
    errorTitle: "Gagal menutup surat jalan",
    success: (d) =>
      d.tertunda
        ? savedOffline(d.kode)
        : d.fotoGagal
        ? {
            tone: "warning",
            title: `${d.kode} selesai, foto belum terkirim`,
            description: `${formatNumber(d.realisasi)} ${unitLabel()} tercatat diterima. Foto: ${d.fotoGagal}`,
          }
        : {
            title: `${d.kode} selesai`,
            description: `${formatNumber(d.realisasi)} ${unitLabel()} tercatat diterima.`,
          },
    onDone: () => setCompleting(null),
  });

  const holdMutation = useDeskMutation({
    mutationFn: holdStop,
    errorTitle: "Gagal mencatat kendala",
    success: (d) =>
      d.tertunda
        ? savedOffline(d.kode)
        : {
            title: `${d.kode} ditandai tertunda`,
            description: `Kantor sudah diberi tahu. Bawa muatannya kembali ke gudang.`,
            tone: "warning" as const,
          },
    onDone: () => {
      setHolding(null);
      setAlasan("");
    },
  });

  const openComplete = (stop: RunStop) => {
    // Prefilled with what the paperwork says and who normally signs, so a
    // routine drop is two taps and only an exception needs typing.
    setForm({
      lines: stop.lines.map((l) => ({
        productId: l.productId,
        realisasi: l.target,
        // Empties come back one-for-one with what was accepted, until the
        // driver says otherwise; consumables never come back.
        kembali: l.returnable ? l.target : 0,
        kembaliDiubah: false,
      })),
      diterimaOleh: stop.penanggungJawab,
      catatan: "",
      foto: null,
    });
    setLokasiTutup("mencari");
    setCompleting(stop);
  };

  // Read the phone's position as the dialog opens, so a driver closing the
  // wrong stop -- or from the wrong place -- sees it before filing. The
  // filing reuses this fix (capturePosition accepts one up to 30 s old).
  useEffect(() => {
    if (!completing) return;
    let current = true;
    checkLocation(completing.id)
      .then((l) => current && setLokasiTutup(l))
      .catch(() => current && setLokasiTutup(undefined));
    return () => {
      current = false;
    };
  }, [completing]);

  // One filing at a time, decided synchronously. `disabled` only lands on the
  // next render, so three quick taps used to file three times -- and the
  // second came back as "already closed" right after a successful close.
  const filing = useRef(false);
  const fileOnce = <T,>(
    mutation: { mutate: (args: T, options?: { onSettled?: () => void }) => void },
    args: T,
  ) => {
    if (filing.current) return;
    filing.current = true;
    mutation.mutate(args, {
      onSettled: () => {
        filing.current = false;
        // Success or refusal, read the run again: a refusal usually means the
        // kernet or the office filed first, and a card still offering
        // "Berangkat" for a closed stop invites the same tap again.
        void run.refetch();
      },
    });
  };

  const pending = [departMutation, arriveMutation].find((m) => m.isPending);
  const busyStopId = pending ? (pending.variables as string | undefined) : undefined;

  const data = run.data;
  const t = data?.totals;
  const isDone = (stop: RunStop) => stop.status === "Selesai" || stop.status === "Tertunda";
  const openStops = (data?.stops ?? []).filter((stop) => !isDone(stop));
  const doneStops = (data?.stops ?? []).filter(isDone);
  const showRit = new Set((data?.stops ?? []).map((stop) => stop.rit)).size > 1;

  return (
    <div className="mx-auto max-w-3xl space-y-5">
      <PageHeader
        eyebrow="Tugas saya"
        title="Rute Saya"
        description={formatDateLong(new Date())}
      />

      {run.isLoading ? (
        <div className="space-y-3">
          <Skeleton className="h-28 w-full" />
          {Array.from({ length: 4 }).map((_, i) => (
            <Skeleton key={i} className="h-32 w-full" />
          ))}
        </div>
      ) : (
        <>
          {/* Today, in one panel */}
          {data?.driver && t && (
            <Panel spine={t.sisa === 0 ? "text-pine" : "text-signal"}>
              <PanelBody className="space-y-4">
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="min-w-0">
                    {/* The signed-in crew member, not always the driver: the
                        kernet saw the sopir's name as their own (R4-12). */}
                    <p className="text-lg font-semibold tracking-[-0.01em] text-ink">
                      {data.peran === "Kernet" && data.kernet ? data.kernet : data.driver.nama}
                    </p>
                    <p className="data text-xs text-ink-muted">
                      {data.driver.plat} · {data.driver.armada}
                    </p>
                    {data.peran === "Kernet" ? (
                      <p className="text-xs text-ink-muted">
                        Anda ikut sebagai kernet bersama {data.driver.nama}. Rute direkam dari ponsel sopir.
                      </p>
                    ) : (
                      data.kernet && <p className="text-xs text-ink-muted">Kernet: {data.kernet}</p>
                    )}
                  </div>
                  <StatusBadge
                    variant={getStatusVariant(data.driver.status)}
                    label={data.driver.status}
                  />
                </div>

                {/* Off by default. This is not the fix @/lib/geo.ts captures
                    at the moment of a filing -- that always happens,
                    whatever this is set to. This is a continuous trail, and
                    it exists only because the driver pressed the button. */}
                {trackingOffered && (
                  <div className="border-t border-line pt-1">
                    <Toggle
                      checked={gpsStream.wanted}
                      onChange={() => gpsStream.toggle()}
                      label="Rekam perjalanan"
                      description={
                        gpsStream.active
                          ? "Posisi Anda dibagikan ke kantor selama rute ini."
                          : "Kantor tidak melihat posisi Anda kecuali Anda menyalakan ini."
                      }
                    />
                    {gpsStream.active && (
                      <p className="flex items-center gap-1.5 text-2xs text-ink-muted">
                        <span className="now-pulse h-1.5 w-1.5 rounded-full bg-signal" aria-hidden />
                        Merekam
                      </p>
                    )}
                  </div>
                )}

                <div>
                  <div className="mb-1.5 flex items-baseline justify-between gap-3 text-xs">
                    <span className="text-ink-muted">
                      <span className="data text-base font-semibold text-ink">
                        {formatNumber(t.selesai)}
                      </span>
                      <span className="data text-ink-muted">/{formatNumber(t.singgah)}</span>{" "}
                      singgah selesai
                    </span>
                    <span className="data text-ink-muted">
                      {formatNumber(t.terkirim)}/{formatNumber(t.muatan)} {unitLabel()}
                    </span>
                  </div>
                  <Meter
                    value={t.selesai}
                    max={t.singgah || 1}
                    tone={t.sisa === 0 ? "pine" : "signal"}
                    label={`${t.selesai} dari ${t.singgah} pemberhentian selesai`}
                  />
                </div>

                <dl className="grid grid-cols-2 gap-3 border-t border-line pt-3 text-center sm:grid-cols-4">
                  <Figure label="Sisa singgah" value={formatNumber(t.sisa)} />
                  <Figure label={`${unitLabelTitle()} kosong diterima`} value={formatNumber(t.kosong)} />
                  <Figure label="Isi dibawa kembali" value={formatNumber(t.isiKembali)} />
                  <Figure
                    label="Tertunda"
                    value={formatNumber(t.tertunda)}
                    tone={t.tertunda > 0 ? "rust" : undefined}
                  />
                </dl>
              </PanelBody>
            </Panel>
          )}

          {/* What this phone is still holding */}
          {(outbox.pending.length > 0 || outbox.refused.length > 0) && (
            <Panel spine={outbox.refused.length > 0 ? "text-rust" : "text-signal"}>
              <PanelBody className="space-y-3">
                {outbox.pending.length > 0 && (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-ink">
                        {outbox.pending.length} catatan menunggu dikirim
                      </p>
                      <p className="text-xs text-ink-muted">
                        Tersimpan di perangkat ini. Dikirim otomatis begitu ada sinyal; jangan keluar
                        dari akun sebelum terkirim.
                      </p>
                    </div>
                    <Button size="sm" variant="outline" onClick={() => void outbox.sendNow()}>
                      Kirim sekarang
                    </Button>
                  </div>
                )}
                {outbox.refused.map((f) => (
                  <div key={f.id} className="flex flex-wrap items-start justify-between gap-3 border-t border-line pt-3 first:border-t-0 first:pt-0">
                    <div className="min-w-0">
                      <p className="text-sm font-semibold text-rust-ink">Ditolak server</p>
                      <p className="text-xs text-ink-muted">{f.error}</p>
                    </div>
                    {/* Two steps: the button sits where "Kirim sekarang" just was,
                        and a stray tap must not throw away a filing. */}
                    <Button
                      size="sm"
                      variant={confirmDiscard === f.id ? "destructive" : "ghost"}
                      onClick={() => {
                        if (confirmDiscard === f.id) {
                          setConfirmDiscard(null);
                          void outbox.discard(f.id);
                        } else {
                          setConfirmDiscard(f.id);
                        }
                      }}
                    >
                      {confirmDiscard === f.id ? "Ya, buang" : "Buang"}
                    </Button>
                  </div>
                ))}
              </PanelBody>
            </Panel>
          )}

          {/* The run */}
          {(data?.stops ?? []).length === 0 ? (
            <Panel>
              <EmptyState
                icon={Route}
                title="Tidak ada penugasan hari ini"
                description="Rute muncul di sini setelah kantor mengonfirmasi rencana distribusi dan menerbitkan surat jalan."
              />
            </Panel>
          ) : (
            <>
              {/* Work still to do first, in driving order; what is finished
                  below it. A driver on a second load used to scroll past
                  every stop of the first one -- three screens on a phone --
                  to find where to go next. */}
              {[
                { key: "open", title: null, stops: openStops },
                { key: "done", title: `Sudah selesai (${doneStops.length})`, stops: doneStops },
              ]
                .filter((group) => group.stops.length > 0)
                .map((group) => (
                  <section key={group.key} className="space-y-2">
                    {group.title && (
                      <h2 className="label pt-2 text-2xs text-ink-muted">{group.title}</h2>
                    )}
                    <ol className="space-y-3">
                      {group.stops.map((stop) => (
                        <StopCard
                          key={stop.id}
                          stop={stop}
                          isNext={stop.id === data?.stopBerikutId}
                          rekamLokasi={data?.rekamLokasi ?? false}
                          waiting={outbox.waitingStops.has(stop.id)}
                          showRit={showRit}
                          canOpenOutlet={canOpenOutlet}
                          busy={busyStopId === stop.id}
                          isPending={
                            departMutation.isPending ||
                            arriveMutation.isPending ||
                            completeMutation.isPending ||
                            holdMutation.isPending
                          }
                          onDepart={() => fileOnce(departMutation, stop.id)}
                          onArrive={() => fileOnce(arriveMutation, stop.id)}
                          onComplete={() => openComplete(stop)}
                          onHold={() => {
                            setAlasan("");
                            setHolding(stop);
                          }}
                        />
                      ))}
                    </ol>
                  </section>
                ))}
            </>
          )}

          {t && t.singgah > 0 && t.sisa === 0 && (
            <Panel spine="text-pine">
              <PanelBody className="text-center">
                <p className="text-sm font-semibold text-ink">Rute hari ini selesai.</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  {formatNumber(t.terkirim)} {unitLabel()} terkirim. Serahkan ke petugas gudang:{" "}
                  {formatNumber(t.kosong)} {unitLabel()} kosong
                  {t.isiKembali > 0 &&
                    `, ${formatNumber(t.isiKembali)} ${unitLabel()} isi yang tidak terkirim`}
                  , dan berkas surat jalan.
                </p>
              </PanelBody>
            </Panel>
          )}
        </>
      )}

      {/* Closing a drop */}
      <Dialog open={!!completing} onOpenChange={(o) => !o && setCompleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tutup {completing?.kode}</DialogTitle>
            <DialogDescription>
              Hitung jumlah yang benar-benar diterima {completing?.outlet} sebelum
              meninggalkan lokasi. Angka ini yang dicatat kantor.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {lokasiTutup !== "mencari" && lokasiTutup?.verdict === "jauh" && (
              <p
                role="alert"
                className="flex items-start gap-2 rounded-md border border-signal bg-signal-soft/40 p-3 text-xs leading-relaxed text-ink"
              >
                <TriangleAlert className="mt-0.5 h-4 w-4 shrink-0 text-signal-ink" aria-hidden />
                <span>
                  Posisi ponsel Anda {formatDistance(lokasiTutup.jarakMeter ?? 0)} dari{" "}
                  {completing?.outlet}. Pastikan Anda sudah di lokasi yang benar. Anda tetap
                  bisa menutup surat jalan ini.
                </span>
              </p>
            )}
            {(completing?.lines ?? []).map((line, i) => (
              <ProductBlock
                key={line.productId}
                line={line}
                realisasi={form.lines[i]?.realisasi ?? 0}
                kembali={form.lines[i]?.kembali ?? 0}
                onChange={(patch) =>
                  setForm((f) => ({
                    ...f,
                    lines: f.lines.map((l, li) => {
                      if (li !== i) return l;
                      if (patch.kembali !== undefined) {
                        return { ...l, kembali: patch.kembali, kembaliDiubah: true };
                      }
                      // Empties follow what was accepted until the driver
                      // types their own number; after that it is theirs.
                      const realisasi = patch.realisasi ?? l.realisasi;
                      return {
                        ...l,
                        realisasi,
                        kembali:
                          l.kembaliDiubah || !line.returnable
                            ? l.kembali
                            : Number.isNaN(realisasi)
                              ? 0
                              : realisasi,
                      };
                    }),
                  }))
                }
              />
            ))}

            <Field
              label="Diterima oleh"
              htmlFor="s-diterima"
              hint="Nama orang yang menerima dan menandatangani surat jalan (minimal 2 huruf)."
              required
            >
              <TextInput
                id="s-diterima"
                value={form.diterimaOleh}
                onChange={(e) => setForm({ ...form, diterimaOleh: e.target.value })}
              />
            </Field>

            <Field label="Catatan" htmlFor="s-catatan">
              <TextareaInput
                id="s-catatan"
                rows={2}
                placeholder={`Contoh: ${outletLabel()} hanya sanggup menerima 80 ${unitLabel()}.`}
                value={form.catatan}
                onChange={(e) => setForm({ ...form, catatan: e.target.value })}
              />
            </Field>

            {canAttachPhoto && (
              <Field
                label="Foto bukti"
                htmlFor="s-foto"
                hint="Opsional. Tabung yang diturunkan, atau surat jalan yang sudah ditandatangani."
              >
                {/* capture opens the rear camera on a phone; on a desktop it
                    falls back to choosing a file. */}
                <label
                  htmlFor="s-foto"
                  className="flex min-h-11 cursor-pointer items-center gap-2 rounded-md border border-dashed border-line-strong px-3 py-2 text-sm text-ink transition-colors hover:bg-panel-sunk focus-within:ring-2 focus-within:ring-signal"
                >
                  <Camera className="h-4 w-4 shrink-0 text-ink-muted" />
                  <span className="min-w-0 flex-1 truncate">
                    {form.foto ? form.foto.name : "Ambil foto"}
                  </span>
                  <input
                    id="s-foto"
                    type="file"
                    accept={DELIVERY_PHOTO_ACCEPT}
                    capture="environment"
                    className="sr-only"
                    onChange={(e) => setForm({ ...form, foto: e.target.files?.[0] ?? null })}
                  />
                </label>
              </Field>
            )}
          </div>

          <DialogFooter className="sticky bottom-0 -mx-1 border-t border-line bg-panel px-1 pt-3">
            <Button variant="outline" className="min-h-12" onClick={() => setCompleting(null)}>
              Batal
            </Button>
            <Button
              className="min-h-12"
              disabled={
                !completing ||
                // The server refuses fewer than 2 characters
                // (RECIPIENT_REQUIRED); the button said yes to one (R4-13).
                form.diterimaOleh.trim().length < 2 ||
                form.lines.some(
                  (l, i) =>
                    !Number.isInteger(l.realisasi) ||
                    l.realisasi < 0 ||
                    l.realisasi > (completing?.lines[i]?.target ?? 0) ||
                    !Number.isInteger(l.kembali) ||
                    l.kembali < 0,
                ) ||
                completeMutation.isPending
              }
              onClick={() =>
                completing &&
                fileOnce(completeMutation, {
                  deliveryId: completing.id,
                  lines: form.lines,
                  diterimaOleh: form.diterimaOleh,
                  catatan: form.catatan,
                  foto: form.foto ?? undefined,
                })
              }
            >
              <PackageCheck className="h-4 w-4" />
              {completeMutation.isPending ? "Menyimpan…" : "Tutup surat jalan"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Could not deliver */}
      <Dialog open={!!holding} onOpenChange={(o) => !o && setHolding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Laporkan kendala di {holding?.outlet}</DialogTitle>
            <DialogDescription>
              Surat jalan ditutup sebagai tertunda dan muatannya dibawa kembali ke
              gudang. Kantor langsung diberi tahu.
            </DialogDescription>
          </DialogHeader>

          <Field label="Apa yang terjadi" htmlFor="s-alasan" required>
            <TextareaInput
              id="s-alasan"
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder={`Contoh: ${outletLabel()} tutup saat armada tiba.`}
            />
          </Field>

          <DialogFooter className="sticky bottom-0 -mx-1 border-t border-line bg-panel px-1 pt-3">
            <Button variant="outline" className="min-h-12" onClick={() => setHolding(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              className="min-h-12"
              disabled={!alasan.trim() || holdMutation.isPending}
              onClick={() =>
                holding &&
                fileOnce(holdMutation, { deliveryId: holding.id, catatan: alasan })
              }
            >
              {holdMutation.isPending ? "Menyimpan…" : "Tandai tertunda"}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

/* ── one stop ──────────────────────────────────────────────────────────── */

function StopCard({
  stop,
  isNext,
  rekamLokasi,
  waiting,
  showRit,
  canOpenOutlet,
  busy,
  isPending,
  onDepart,
  onArrive,
  onComplete,
  onHold,
}: {
  stop: RunStop;
  isNext: boolean;
  rekamLokasi: boolean;
  /** Something for this stop is saved on the phone and not yet sent. */
  waiting: boolean;
  /** The driver has more than one load today, so say which this is. */
  showRit: boolean;
  /** Whether the outlet page is open to this user; drivers usually not. */
  canOpenOutlet: boolean;
  /** This stop's own depart/arrive is waiting on the phone's GPS. */
  busy: boolean;
  isPending: boolean;
  onDepart: () => void;
  onArrive: () => void;
  onComplete: () => void;
  onHold: () => void;
}) {
  const closed = stop.status === "Selesai" || stop.status === "Tertunda";

  return (
    <li
      className={cn(
        "spine overflow-hidden rounded-md border bg-panel",
        spineFor(stop.status),
        // The stop being driven is the only one that needs to be readable at
        // arm's length; the rest are context and recede.
        isNext ? "border-signal" : "border-line",
        closed && "opacity-75",
      )}
    >
      <div className={cn("p-4", isNext && "bg-signal-soft/40")}>
        <div className="flex items-start gap-3">
          <span
            className={cn(
              "data flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold",
              stop.status === "Selesai"
                ? "bg-pine text-white"
                : isNext
                  ? "bg-signal text-[rgb(23_26_22)]"
                  : "border border-line-strong text-ink-muted",
            )}
            aria-hidden
          >
            {stop.status === "Selesai" ? "✓" : stop.urutan}
          </span>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1">
              {canOpenOutlet ? (
                <Link
                  to={`/outlet/${stop.outletId}`}
                  className="text-base font-semibold leading-tight text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
                >
                  {stop.outlet}
                </Link>
              ) : (
                <span className="text-base font-semibold leading-tight text-ink">{stop.outlet}</span>
              )}
              <span className="data shrink-0 text-xs text-ink-muted">
                {stop.jamRencana}
              </span>
            </div>

            <p className="mt-1 flex items-start gap-1.5 text-xs leading-relaxed text-ink-muted">
              <MapPin className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              <span>
                {stop.alamat}, Kec. {stop.kecamatan}
              </span>
            </p>

            <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs">
              {stop.lines.map((l) => (
                <span key={l.productId} className="data font-semibold text-ink">
                  {formatNumber(l.target)}
                  <span className="ml-1 font-sans font-medium text-ink-muted">
                    {l.nama}
                  </span>
                </span>
              ))}
              <StatusBadge
                variant={getStatusVariant(stop.status)}
                label={stop.status}
              />
              {showRit && stop.rit != null && (
                <StatusBadge variant="info" label={`Rit ${stop.rit}`} />
              )}
              {waiting && <StatusBadge variant="warning" label="Menunggu dikirim" />}
              <span className="data text-2xs text-ink-muted">{stop.kode}</span>
            </p>
          </div>
        </div>

        {/* What was recorded, once it has been */}
        {closed && (
          <dl className="mt-3 space-y-1 border-t border-line pt-3 text-xs">
            {stop.status === "Selesai" ? (
              <>
                <Row
                  label="Diterima"
                  value={`${formatNumber(stop.realisasi)} ${unitLabel()}${
                    stop.realisasi < stop.target
                      ? ` (kurang ${formatNumber(stop.target - stop.realisasi)})`
                      : ""
                  }`}
                />
                {stop.unitKembali != null && (
                  <Row
                    label="Kosong diterima"
                    value={`${formatNumber(stop.unitKembali)} ${unitLabel()}`}
                  />
                )}
                {stop.isiKembali != null && (
                  <Row
                    label="Isi dibawa kembali"
                    value={`${formatNumber(stop.isiKembali)} ${unitLabel()}`}
                  />
                )}
                {stop.diterimaOleh && (
                  <Row label="Diterima oleh" value={stop.diterimaOleh} />
                )}
                {stop.tibaPada && (
                  <Row label="Tiba" value={formatTime(stop.tibaPada)} />
                )}
                {stop.selesaiPada && (
                  <Row label="Jam" value={formatTime(stop.selesaiPada)} />
                )}
              </>
            ) : (
              <>
                <Row label="Kendala" value={stop.catatan ?? "—"} />
                {stop.isiKembali != null && (
                  <Row
                    label="Isi dibawa kembali"
                    value={`${formatNumber(stop.isiKembali)} ${unitLabel()}`}
                  />
                )}
              </>
            )}
          </dl>
        )}
      </div>

      {/* What the device reported when this was filed. Shown to the driver
          rather than only to the office: someone whose position is recorded
          should be able to see what was recorded about them. */}
      {stop.filings.length > 0 && (
        <ul className="border-t border-line px-4 py-2">
          {stop.filings.map((f, i) => (
            <FilingLine key={`${f.tipe}-${i}`} filing={f} />
          ))}
        </ul>
      )}

      {/* Actions. Full width and tall — this is used one-handed, in a cab. */}
      {!closed && (
        <div className="flex flex-wrap gap-2 border-t border-line bg-panel-sunk p-3">
          {stop.telepon && (
            <Button asChild variant="outline" size="lg" className="min-h-12 flex-1">
              <a href={`tel:${stop.telepon}`}>
                <Phone className="h-4 w-4" />
                Telepon
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="lg" className="min-h-12 flex-1">
            <a
              href={`https://www.google.com/maps/dir/?api=1&destination=${stop.lat},${stop.lng}`}
              target="_blank"
              rel="noreferrer"
            >
              <Navigation className="h-4 w-4" />
              Navigasi
            </a>
          </Button>

          {/* Three filings, one at a time, in the order the day happens:
              leaving, reaching the gate, and what the outlet took. Arrival is
              its own tap rather than folded into the completion — the wait
              between the two is the only thing a delay report is made of, and
              a single button makes it zero on every stop. */}
          {stop.status === "Antrian" ? (
            <Button
              size="lg"
              className="min-h-12 w-full"
              disabled={isPending}
              onClick={onDepart}
            >
              <Play className="h-4 w-4" />
              {busy ? "Mencari lokasi…" : `Berangkat ke ${outletLabel()} ini`}
            </Button>
          ) : !stop.tibaPada ? (
            <Button size="lg" className="min-h-12 w-full" disabled={isPending} onClick={onArrive}>
              <MapPin className="h-4 w-4" />
              {busy ? "Mencari lokasi…" : "Tiba di lokasi"}
            </Button>
          ) : (
            <Button size="lg" className="min-h-12 w-full" disabled={isPending} onClick={onComplete}>
              <PackageCheck className="h-4 w-4" />
              Selesai: catat penerimaan
            </Button>
          )}

          {/* Once arrived, closing is the expected next tap but not the only
              one — a driver who arrived and then could not deliver still needs
              the kendala button below. */}
          {!!stop.tibaPada && stop.status !== "Antrian" && (
            <p className="w-full text-2xs text-ink-muted">
              Tiba {formatTime(stop.tibaPada)}
            </p>
          )}

          <Button
            variant="ghost"
            size="lg"
            className="min-h-12 w-full hover:bg-rust-soft hover:text-rust-ink"
            disabled={isPending}
            onClick={onHold}
          >
            <TriangleAlert className="h-4 w-4" />
            Ada kendala di lokasi
          </Button>

          {rekamLokasi && (
            <p className="flex w-full items-start gap-1.5 text-2xs leading-relaxed text-ink-muted">
              <Crosshair className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
              Lokasi Anda direkam saat menekan tombol di atas, bukan sepanjang
              hari. Pengiriman tetap dapat dicatat meski GPS tidak aktif.
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * One product's outcome at a stop.
 *
 * Split per product because that is how it comes off the truck, and because a
 * single blended number cannot be priced: a drop of 100 × 3 kg and 20 × 12 kg
 * is not 120 of anything.
 */
function ProductBlock({
  line,
  realisasi,
  kembali,
  onChange,
}: {
  line: StopLine;
  realisasi: number;
  kembali: number;
  onChange: (patch: { realisasi?: number; kembali?: number }) => void;
}) {
  const kurang = Number.isNaN(realisasi) ? 0 : line.target - realisasi;
  // An emptied box is NaN, not 0: the dialog refuses to file it.
  const parse = (raw: string) => (raw.trim() === "" ? NaN : Number(raw));

  return (
    <div className="rounded-md border border-line bg-panel-sunk p-3">
      <p className="mb-2 flex items-baseline justify-between gap-2">
        <span className="text-sm font-semibold text-ink">{line.nama}</span>
        <span className="data text-2xs text-ink-muted">
          dimuat {formatNumber(line.target)} {line.satuan}
        </span>
      </p>

      <div className={cn("grid gap-3", line.returnable && "sm:grid-cols-2")}>
        <Field label={`Diterima (${line.satuan})`} htmlFor={`r-${line.productId}`} required>
          <TextInput
            id={`r-${line.productId}`}
            type="number"
            inputMode="numeric"
            min={0}
            max={line.target}
            mono
            className="text-lg"
            value={Number.isNaN(realisasi) ? "" : realisasi}
            onChange={(e) => onChange({ realisasi: parse(e.target.value) })}
          />
        </Field>

        {line.returnable && (
          <Field
            label={`${capitalize(line.satuan)} kosong diterima`}
            htmlFor={`k-${line.productId}`}
            hint={`${capitalize(line.satuan)} kosong yang diberikan ${outletLabel()} kepada Anda.`}
          >
            <TextInput
              id={`k-${line.productId}`}
              type="number"
              inputMode="numeric"
              min={0}
              mono
              className="text-lg"
              value={Number.isNaN(kembali) ? "" : kembali}
              onChange={(e) => onChange({ kembali: parse(e.target.value) })}
            />
          </Field>
        )}
      </div>

      {Number.isNaN(realisasi) && (
        <p className="mt-2 text-2xs leading-relaxed text-rust-ink">
          Isi jumlah yang diterima. Tulis 0 jika {outletLabel()} tidak menerima apa pun.
        </p>
      )}
      {realisasi > line.target && (
        <p className="mt-2 text-2xs leading-relaxed text-rust-ink">
          Tidak bisa lebih dari {formatNumber(line.target)} {line.satuan} yang dimuat.
        </p>
      )}
      {kembali < 0 && (
        <p className="mt-2 text-2xs leading-relaxed text-rust-ink">
          Jumlah {line.satuan} kosong tidak boleh minus.
        </p>
      )}
      {kurang > 0 && (
        <p className="mt-2 text-2xs leading-relaxed text-signal-ink">
          Kurang {formatNumber(kurang)} {line.satuan} dari surat jalan. Tulis
          alasannya di catatan.
        </p>
      )}
    </div>
  );
}

const FILING_LABEL: Record<StopFiling["tipe"], string> = {
  berangkat: "Berangkat",
  tiba: "Tiba",
  selesai: "Selesai",
  tertunda: "Kendala",
};

function FilingLine({ filing }: { filing: StopFiling }) {
  const { verdict, jarakMeter, posisi } = filing;

  const tone =
    verdict === "sesuai"
      ? "text-pine-ink"
      : verdict === "jauh"
        ? "text-rust-ink"
        : "text-ink-muted";

  const detail =
    verdict === "sesuai"
      ? `di lokasi outlet${jarakMeter != null ? ` · ${formatDistance(jarakMeter)}` : ""}`
      : verdict === "jauh"
        ? `${formatDistance(jarakMeter ?? 0)} dari ${outletLabel()}`
        : verdict === "kasar"
          ? `lokasi kurang akurat (±${formatDistance(posisi.akurasi ?? 0)})`
          : GEO_STATUS_LABEL[posisi.status];

  return (
    <li className="flex items-center gap-1.5 py-0.5 text-2xs">
      {verdict === "tanpa-lokasi" ? (
        <ShieldQuestion className={cn("h-3 w-3 shrink-0", tone)} aria-hidden />
      ) : (
        <Crosshair className={cn("h-3 w-3 shrink-0", tone)} aria-hidden />
      )}
      <span className="text-ink-muted">
        {FILING_LABEL[filing.tipe]} {formatTime(filing.at)}
      </span>
      <span className={cn("truncate", tone)}>· {detail}</span>
    </li>
  );
}

function capitalize(word: string): string {
  return word.charAt(0).toUpperCase() + word.slice(1);
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-ink-muted">{label}</dt>
      <dd className="data text-right text-ink">{value}</dd>
    </div>
  );
}

function Figure({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone?: "rust";
}) {
  return (
    <div>
      <dt className="label text-2xs text-ink-muted">{label}</dt>
      <dd
        className={cn(
          "data mt-0.5 text-lg font-semibold",
          tone === "rust" ? "text-rust-ink" : "text-ink",
        )}
      >
        {value}
      </dd>
    </div>
  );
}
