import { useState } from "react";
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
  completeStop,
  departStop,
  getMyRun,
  holdStop,
} from "@/features/sopir/api/sopirApi";
import type { RunStop, StopFiling, StopLine } from "@/features/sopir/types";
import { GEO_STATUS_LABEL, formatDistance } from "@/lib/geo";
import { useDeskMutation } from "@/hooks/useDeskMutation";
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
 * What is recorded here is not a status update. `realisasi` is the figure the
 * invoice is raised from, so this page is the point where the day becomes
 * money, and it is the only place that number is known first-hand.
 */
export function SopirPage() {
  const user = useAuthStore((s) => s.user);

  const driverId = user?.driverId ?? "";

  const [completing, setCompleting] = useState<RunStop | null>(null);
  const [holding, setHolding] = useState<RunStop | null>(null);
  const [form, setForm] = useState<{
    lines: { productId: string; realisasi: number; kembali: number }[];
    diterimaOleh: string;
    catatan: string;
    foto: File | null;
  }>({ lines: [], diterimaOleh: "", catatan: "", foto: null });
  const canAttachPhoto = useAuthStore((s) => s.hasPermission(PERMISSIONS.DELIVERY_PROOFS_CREATE));
  const [alasan, setAlasan] = useState("");

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
  const trackingOffered =
    !!run.data?.rekamLokasi &&
    (run.data?.stops.some((s) => s.status !== "Selesai" && s.status !== "Tertunda") ?? false);
  const tripKey = run.data?.driver
    ? `${run.data.driver.id}:${run.data.tanggal}`
    : null;
  const gpsStream = useGpsStream({ enabled: trackingOffered, tripKey });

  const departMutation = useDeskMutation({
    mutationFn: (deliveryId: string) => departStop(deliveryId),
    errorTitle: "Gagal mencatat keberangkatan",
    success: (d) => ({
      title: `${d.kode} berangkat`,
      description: "Kantor sekarang melihat armada Anda dalam perjalanan.",
    }),
  });

  const arriveMutation = useDeskMutation({
    mutationFn: (deliveryId: string) => arriveStop(deliveryId),
    errorTitle: "Gagal mencatat kedatangan",
    success: (d) => ({
      title: `${d.kode} tiba di lokasi`,
      description: "Waktu tunggu di lokasi mulai dihitung dari sekarang.",
    }),
  });

  const completeMutation = useDeskMutation({
    mutationFn: completeStop,
    errorTitle: "Gagal menutup surat jalan",
    success: (d) =>
      d.fotoGagal
        ? {
            tone: "warning",
            title: `${d.kode} selesai, foto belum terkirim`,
            description: `${formatNumber(d.realisasi)} ${unitLabel()} tercatat diterima. Foto: ${d.fotoGagal}`,
          }
        : {
            title: `${d.kode} selesai`,
            description: `${formatNumber(d.realisasi)} ${unitLabel()} tercatat diterima. Tagihan terbit otomatis.`,
          },
    onDone: () => setCompleting(null),
  });

  const holdMutation = useDeskMutation({
    mutationFn: holdStop,
    errorTitle: "Gagal mencatat kendala",
    success: (d) => ({
      title: `${d.kode} ditandai tertunda`,
      description: "Kantor akan menjadwalkan ulang pengiriman ini.",
      tone: "warning" as const,
    }),
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
        // Returnables come back one-for-one by default; consumables never do.
        kembali: l.returnable ? l.target : 0,
      })),
      diterimaOleh: stop.penanggungJawab,
      catatan: "",
      foto: null,
    });
    setCompleting(stop);
  };

  const data = run.data;
  const t = data?.totals;

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
                    <p className="text-lg font-semibold tracking-[-0.01em] text-ink">
                      {data.driver.nama}
                    </p>
                    <p className="data text-xs text-ink-muted">
                      {data.driver.plat} · {data.driver.armada}
                    </p>
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

                <dl className="grid grid-cols-3 gap-3 border-t border-line pt-3 text-center">
                  <Figure label="Sisa singgah" value={formatNumber(t.sisa)} />
                  <Figure label={`${unitLabelTitle()} kembali`} value={formatNumber(t.kembali)} />
                  <Figure
                    label="Tertunda"
                    value={formatNumber(t.tertunda)}
                    tone={t.tertunda > 0 ? "rust" : undefined}
                  />
                </dl>
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
            <ol className="space-y-3">
              {(data?.stops ?? []).map((stop) => (
                <StopCard
                  key={stop.id}
                  stop={stop}
                  isNext={stop.id === data?.stopBerikutId}
                  rekamLokasi={data?.rekamLokasi ?? false}
                  isPending={
                    departMutation.isPending ||
                    arriveMutation.isPending ||
                    completeMutation.isPending ||
                    holdMutation.isPending
                  }
                  onDepart={() => departMutation.mutate(stop.id)}
                  onArrive={() => arriveMutation.mutate(stop.id)}
                  onComplete={() => openComplete(stop)}
                  onHold={() => {
                    setAlasan("");
                    setHolding(stop);
                  }}
                />
              ))}
            </ol>
          )}

          {t && t.singgah > 0 && t.sisa === 0 && (
            <Panel spine="text-pine">
              <PanelBody className="text-center">
                <p className="text-sm font-semibold text-ink">Rute hari ini selesai.</p>
                <p className="mt-1 text-xs leading-relaxed text-ink-muted">
                  {formatNumber(t.terkirim)} {unitLabel()} terkirim, {formatNumber(t.kembali)}{" "}
                  {unitLabel()} kosong dibawa kembali. Serahkan {unitLabel()} kosong dan berkas
                  surat jalan ke petugas gudang.
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
              Catat jumlah yang benar-benar diterima {completing?.outlet}. Angka
              ini menjadi dasar tagihan, jadi hitung sebelum meninggalkan lokasi.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4">
            {(completing?.lines ?? []).map((line, i) => (
              <ProductBlock
                key={line.productId}
                line={line}
                realisasi={form.lines[i]?.realisasi ?? 0}
                kembali={form.lines[i]?.kembali ?? 0}
                onChange={(patch) =>
                  setForm((f) => ({
                    ...f,
                    lines: f.lines.map((l, li) =>
                      li === i ? { ...l, ...patch } : l,
                    ),
                  }))
                }
              />
            ))}

            <Field
              label="Diterima oleh"
              htmlFor="s-diterima"
              hint="Nama orang yang menerima dan menandatangani surat jalan."
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>
              Batal
            </Button>
            <Button
              disabled={
                !completing ||
                !form.diterimaOleh.trim() ||
                form.lines.some(
                  (l, i) =>
                    l.realisasi < 0 ||
                    l.realisasi > (completing?.lines[i]?.target ?? 0),
                ) ||
                completeMutation.isPending
              }
              onClick={() =>
                completing &&
                completeMutation.mutate({
                  deliveryId: completing.id,
                  lines: form.lines,
                  diterimaOleh: form.diterimaOleh,
                  catatan: form.catatan,
                  foto: form.foto ?? undefined,
                })
              }
            >
              <PackageCheck className="h-4 w-4" />
              Tutup surat jalan
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
              Surat jalan tetap terbuka dan tidak menerbitkan tagihan. Kantor akan
              menjadwalkan ulang pengiriman ini.
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

          <DialogFooter>
            <Button variant="outline" onClick={() => setHolding(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!alasan.trim() || holdMutation.isPending}
              onClick={() =>
                holding &&
                holdMutation.mutate({ deliveryId: holding.id, catatan: alasan })
              }
            >
              Tandai tertunda
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
  isPending,
  onDepart,
  onArrive,
  onComplete,
  onHold,
}: {
  stop: RunStop;
  isNext: boolean;
  rekamLokasi: boolean;
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
              <Link
                to={`/outlet/${stop.outletId}`}
                className="text-base font-semibold leading-tight text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
              >
                {stop.outlet}
              </Link>
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
                    label="Kosong kembali"
                    value={`${formatNumber(stop.unitKembali)} ${unitLabel()}`}
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
              <Row label="Kendala" value={stop.catatan ?? "—"} />
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
            <Button asChild variant="outline" size="lg" className="flex-1">
              <a href={`tel:${stop.telepon}`}>
                <Phone className="h-4 w-4" />
                Telepon
              </a>
            </Button>
          )}
          <Button asChild variant="outline" size="lg" className="flex-1">
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
              className="w-full"
              disabled={isPending}
              onClick={onDepart}
            >
              <Play className="h-4 w-4" />
              Berangkat ke {outletLabel()} ini
            </Button>
          ) : !stop.tibaPada ? (
            <Button size="lg" className="w-full" disabled={isPending} onClick={onArrive}>
              <MapPin className="h-4 w-4" />
              Tiba di lokasi
            </Button>
          ) : (
            <Button size="lg" className="w-full" disabled={isPending} onClick={onComplete}>
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
            className="w-full hover:bg-rust-soft hover:text-rust-ink"
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
  const kurang = line.target - realisasi;

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
            value={realisasi}
            onChange={(e) => onChange({ realisasi: Number(e.target.value) })}
          />
        </Field>

        {line.returnable && (
          <Field label="Kosong kembali" htmlFor={`k-${line.productId}`}>
            <TextInput
              id={`k-${line.productId}`}
              type="number"
              inputMode="numeric"
              min={0}
              mono
              className="text-lg"
              value={kembali}
              onChange={(e) => onChange({ kembali: Number(e.target.value) })}
            />
          </Field>
        )}
      </div>

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
