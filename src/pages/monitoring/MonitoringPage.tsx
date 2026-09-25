import { useState } from "react";
import { AlertCircle, RefreshCw } from "lucide-react";
import { useMonitoring } from "@/features/monitoring/hooks/useMonitoring";
import { DateRangeFilter } from "@/features/monitoring/components/DateRangeFilter";
import { DriverCardRow } from "@/features/monitoring/components/DriverCardRow";
import { RoundStopList } from "@/features/monitoring/components/RoundStopList";
import { DistribusiMap } from "@/features/monitoring/components/DistribusiMap";
import { MonitoringTable } from "@/features/monitoring/components/MonitoringTable";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { Field, SegmentedControl, TextInput, TextareaInput } from "@/components/common/Field";
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
import { formatNumber, formatPercentId, formatTime } from "@/lib/format";
import type { MonitoringRow } from "@/features/monitoring/types";
import { outletLabel, unitLabel } from "@/lib/lexicon";
import { GeofenceAlertPanel } from "@/features/geofence/components/AlertPanel";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";

const STATUS_TABS = ["Semua", "Antrian", "Proses", "Selesai", "Tertunda"] as const;

export function MonitoringPage() {
  const {
    driverCards,
    monitoringTable,
    allRows,
    assignments,
    totals,
    lastSyncAt,
    isLoading,
    isFetching,
    isError,
    error,
    refetch,
    dateRange,
    setDateRange,
    driverFilter,
    setDriverFilter,
    statusFilter,
    setStatusFilter,
    statusMutation,
    printMutation,
  } = useMonitoring();

  // Completing a stop records what was actually unloaded, so it asks.
  // Previewing a round from a fleet card, without committing the filter.
  const [hoveredDriver, setHoveredDriver] = useState<string | null>(null);
  const [completing, setCompleting] = useState<MonitoringRow | null>(null);
  const [realisasi, setRealisasi] = useState(0);
  const [holding, setHolding] = useState<MonitoringRow | null>(null);
  const [alasan, setAlasan] = useState("");

  const capaian =
    totals && totals.target > 0 ? (totals.realisasi / totals.target) * 100 : 0;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Operasi harian"
        title="Monitoring Distribusi"
        description={`Setiap surat jalan yang sudah terbit, posisinya, dan apa yang benar-benar diterima ${outletLabel()}.`}
        actions={<DateRangeFilter dateRange={dateRange} onChange={setDateRange} />}
      />

      {isError && (
        <Panel spine="text-rust" className="flex items-center gap-3 px-5 py-3.5">
          <AlertCircle className="h-4 w-4 shrink-0 text-rust-ink" />
          <p className="flex-1 text-sm text-ink">
            Papan monitoring gagal dimuat.{" "}
            <span className="text-ink-muted">{error?.message}</span>
          </p>
          <Button size="sm" variant="outline" onClick={() => refetch()}>
            Coba lagi
          </Button>
        </Panel>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat
          label="Realisasi periode"
          value={formatNumber(totals?.realisasi ?? 0)}
          unit={unitLabel()}
          hint={`${formatPercentId(capaian)} dari ${formatNumber(totals?.target ?? 0)} target`}
        />
        <Stat
          label="Sedang berjalan"
          value={formatNumber(totals?.proses ?? 0)}
          unit="surat jalan"
          tone={totals && totals.proses > 0 ? "signal" : undefined}
        />
        <Stat
          label="Selesai"
          value={formatNumber(totals?.selesai ?? 0)}
          unit="surat jalan"
          tone={totals && totals.selesai > 0 ? "pine" : undefined}
        />
        <Stat
          label="Tertunda"
          value={formatNumber(totals?.tertunda ?? 0)}
          unit="surat jalan"
          tone={totals && totals.tertunda > 0 ? "rust" : undefined}
        />
      </div>

      <section>
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <h2 className="label text-2xs text-ink-muted">Status armada</h2>
          {driverFilter && (
            <Button variant="ghost" size="xs" onClick={() => setDriverFilter(null)}>
              Tampilkan semua armada
            </Button>
          )}
        </div>
        <DriverCardRow
          cards={driverCards}
          isLoading={isLoading}
          selectedId={driverFilter}
          onSelect={setDriverFilter}
          onHover={setHoveredDriver}
        />
      </section>

      <Panel>
        <PanelHeader
          title="Peta distribusi"
          hint={
            driverFilter
              ? "Menampilkan satu armada. Klik peta atau kartu armada untuk melihat semuanya."
              : `Titik ${outletLabel()} dan posisi armada yang sedang berjalan`
          }
          actions={
            <div className="flex items-center gap-3">
              <span className="flex items-center gap-1.5 text-2xs text-ink-muted">
                <span
                  className={cn(
                    "h-1.5 w-1.5 rounded-full",
                    isFetching ? "bg-signal now-pulse" : "bg-pine",
                  )}
                  aria-hidden
                />
                Sinkron {lastSyncAt ? formatTime(lastSyncAt) : "—"}
              </span>
              <Button variant="ghost" size="sm" onClick={() => refetch()}>
                <RefreshCw className={cn("h-3.5 w-3.5", isFetching && "animate-spin")} />
                Muat ulang
              </Button>
            </div>
          }
        />
        {/* Map two thirds, round one third.
            The map used to be full width at 420px tall: a 3.24:1 letterbox for
            a round that is roughly square (3.4 x 4.5 km). fitBounds picks the
            zoom where BOTH axes fit, so height was the binding constraint and
            the camera was pinned at zoom 13 no matter what it did — the route
            used 14% of the available width. Measured: 620px still gives zoom
            13, 640px gives zoom 14 — and dropping a redundant second layer
            of bounds padding buys the same level back at 560px. Trading width
            for height buys the zoom;
            the width that comes off goes to the stop list, which is where the
            sequence wanted to live anyway. */}
        <div className="grid gap-4 p-4 lg:grid-cols-3">
          <div className="lg:col-span-2">
            <DistribusiMap
              heightClass="h-72 sm:h-96 lg:h-[560px]"
              drivers={driverCards}
              rows={allRows}
              assignments={assignments}
              selectedDriverId={driverFilter ?? undefined}
              onSelectDriver={setDriverFilter}
              hoveredDriverId={hoveredDriver}
            />
          </div>
          <div className="min-h-[18rem] lg:h-[560px]">
            <RoundStopList
              rows={allRows}
              drivers={driverCards}
              assignments={assignments}
              focusedDriverId={hoveredDriver ?? driverFilter ?? null}
            />
          </div>
        </div>
      </Panel>

      <Panel>
        <PanelHeader
          title="Surat jalan"
          hint={`${monitoringTable.length} dari ${allRows.length} baris ditampilkan`}
          actions={
            <SegmentedControl
              value={statusFilter}
              onChange={setStatusFilter}
              options={STATUS_TABS.map((s) => ({
                value: s,
                label: s,
                count:
                  s === "Semua"
                    ? allRows.length
                    : allRows.filter((r) => r.status === s).length,
              }))}
            />
          }
        />
        <MonitoringTable
          data={monitoringTable}
          isLoading={isLoading}
          // Only while the mutation is actually in flight -- react-query
          // keeps `variables` set to whatever was last sent even after it
          // settles, so without `isPending` a row whose status change keeps
          // it in the same action branch (Antrian -> Proses both still show
          // "Selesai") ends up permanently disabled after its first filing.
          pendingId={statusMutation.isPending ? statusMutation.variables?.deliveryId : undefined}
          onStart={(row) =>
            statusMutation.mutate({ deliveryId: row.id, status: "Proses" })
          }
          onComplete={(row) => {
            setRealisasi(row.realisasi || row.target);
            setCompleting(row);
          }}
          onHold={(row) => {
            setAlasan("");
            setHolding(row);
          }}
          onPrint={(row) => printMutation.mutate(row.id)}
        />
      </Panel>

      {/* Surat jalan is what this tenant actually works from day to day;
          breaches are read after, not before, it. */}
      <CanAccess permission={PERMISSIONS.GEOFENCE_ALERTS_VIEW}>
        <GeofenceAlertPanel />
      </CanAccess>

      {/* Completing a drop */}
      <Dialog open={!!completing} onOpenChange={(open) => !open && setCompleting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tutup {completing?.kode}</DialogTitle>
            <DialogDescription>
              Catat jumlah {unitLabel()} yang benar-benar diterima {completing?.outlet}.
              Angka ini menjadi dasar tagihan.
            </DialogDescription>
          </DialogHeader>

          <Field
            label="Realisasi diterima"
            htmlFor="realisasi"
            hint={
              completing
                ? `Target pada surat jalan: ${formatNumber(completing.target)} ${unitLabel()}.`
                : undefined
            }
          >
            <TextInput
              id="realisasi"
              type="number"
              min={0}
              max={completing?.target}
              mono
              value={realisasi}
              onChange={(e) => setRealisasi(Number(e.target.value))}
            />
          </Field>

          {completing && realisasi < completing.target && (
            <p className="rounded-md border border-line bg-signal-soft px-3 py-2 text-xs text-ink">
              Kurang <span className="data">{formatNumber(completing.target - realisasi)}</span>{" "}
              {unitLabel()} dari target. Selisih tercatat pada surat jalan dan laporan periode.
            </p>
          )}

          <DialogFooter>
            <Button variant="outline" onClick={() => setCompleting(null)}>
              Batal
            </Button>
            <Button
              disabled={statusMutation.isPending}
              onClick={() =>
                completing &&
                statusMutation.mutate(
                  { deliveryId: completing.id, status: "Selesai", realisasi },
                  { onSettled: () => setCompleting(null) },
                )
              }
            >
              Tutup surat jalan
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        A reason is required, not optional: POST /deliveries/:id/fail refuses
        a failure nobody explained (ck_deliveries_failure_reason), and a
        canned string here would satisfy that constraint while defeating the
        reason it exists — an auditor reading this later gets nothing to
        argue from. Mirrors the driver's own kendala dialog on /sopir.
      */}
      <Dialog open={!!holding} onOpenChange={(open) => !open && setHolding(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Tandai {holding?.kode} tertunda?</DialogTitle>
            <DialogDescription>
              Pengiriman ke {holding?.outlet} dicatat gagal diselesaikan hari ini. Surat
              jalan tetap terbuka dan tidak menerbitkan tagihan.
            </DialogDescription>
          </DialogHeader>

          <Field label="Apa yang terjadi" htmlFor="m-alasan" required>
            <TextareaInput
              id="m-alasan"
              rows={3}
              value={alasan}
              onChange={(e) => setAlasan(e.target.value)}
              placeholder={`Contoh: ${holding?.outlet ?? "outlet"} tutup saat armada tiba.`}
            />
          </Field>

          <DialogFooter>
            <Button variant="outline" onClick={() => setHolding(null)}>
              Batal
            </Button>
            <Button
              variant="destructive"
              disabled={!alasan.trim() || statusMutation.isPending}
              onClick={() =>
                holding &&
                statusMutation.mutate(
                  { deliveryId: holding.id, status: "Tertunda", catatan: alasan },
                  { onSettled: () => setHolding(null) },
                )
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

function Stat({
  label,
  value,
  unit,
  hint,
  tone,
}: {
  label: string;
  value: string;
  unit: string;
  hint?: string;
  tone?: "signal" | "pine" | "rust";
}) {
  // Written out rather than interpolated — Tailwind only emits classes it can
  // see as complete strings.
  const spine = {
    signal: "spine text-signal",
    pine: "spine text-pine",
    rust: "spine text-rust",
  };

  return (
    <div
      className={cn("rounded-md border border-line bg-panel p-4", tone && spine[tone])}
    >
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p className="data mt-1.5 truncate text-figure font-semibold text-ink">
        {value}
        <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
          {unit}
        </span>
      </p>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
