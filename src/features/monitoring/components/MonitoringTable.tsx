import { DeliveryPhotosButton } from "./DeliveryPhotosButton";
import { Link } from "react-router-dom";
import { CheckCircle2, Crosshair, PlayCircle, Printer, Route, TriangleAlert } from "lucide-react";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Meter } from "@/components/common/Panel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { formatNumber, formatPercentId } from "@/lib/format";
import { formatDistance } from "@/lib/geo";
import { cn } from "@/lib/utils";
import type { FilingLocation, MonitoringRow } from "../types";
import { outletLabel, outletLabelTitle } from "@/lib/lexicon";

interface MonitoringTableProps {
  data: MonitoringRow[];
  isLoading: boolean;
  onStart: (row: MonitoringRow) => void;
  onComplete: (row: MonitoringRow) => void;
  onHold: (row: MonitoringRow) => void;
  onPrint: (row: MonitoringRow) => void;
  pendingId?: string;
}

export function MonitoringTable({
  data,
  isLoading,
  onStart,
  onComplete,
  onHold,
  onPrint,
  pendingId,
}: MonitoringTableProps) {
  const columns: Column<MonitoringRow>[] = [
    {
      key: "kode",
      header: "Surat jalan",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.kode}</span>
          {/* jamRencana is empty against the real service — the plan has no
              per-stop clock time, only a position — so the round's own order
              is shown instead of a blank line. */}
          <span className="data block text-2xs text-ink-muted">
            {row.jamRencana || `Urutan ${row.urutan}`}
          </span>
        </>
      ),
      // Sorted by urutan, not jamRencana: jamRencana is always "", and sorting by it would be a no-op that only worked by
      // accident of a stable sort landing on server order.
      sortValue: (row) => row.urutan,
    },
    {
      key: outletLabel(),
      header: outletLabelTitle(),
      render: (row) => (
        <>
          <Link
            to={`/outlet/${row.outletId}`}
            className="block font-medium text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
          >
            {row.outlet}
          </Link>
          <span className="block text-xs text-ink-muted">{row.alamat}</span>
        </>
      ),
      sortValue: (row) => row.outlet,
    },
    {
      key: "driver",
      header: "Armada",
      render: (row) => (
        <Link
          to={`/drivers/${row.driverId}`}
          className="text-ink-muted hover:text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
        >
          {row.driver}
        </Link>
      ),
      sortValue: (row) => row.driver,
    },
    {
      key: "capaian",
      header: "Realisasi",
      width: "14rem",
      render: (row) => (
        <div className="min-w-[9rem]">
          <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
            <span className="data text-ink">
              {formatNumber(row.realisasi)}
              <span className="text-ink-muted"> / {formatNumber(row.target)}</span>
            </span>
            <span className="data text-ink-muted">
              {formatPercentId(row.pencapaianPersen)}
            </span>
          </div>
          <Meter
            value={row.realisasi}
            max={row.target}
            tone={
              row.status === "Tertunda"
                ? "rust"
                : row.realisasi >= row.target
                  ? "pine"
                  : "signal"
            }
            label={`${row.outlet}: ${formatPercentId(row.pencapaianPersen)} tercapai`}
          />
        </div>
      ),
      sortValue: (row) => row.pencapaianPersen,
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      render: (row) => (
        <>
          <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
          {/* Every closed stop says how far from the pangkalan it was closed
              (client request, 24 Nov): the dispatcher reads the distance on
              every row, not only on the ones past the geofence. Past it stays
              loud; within it, or on a fix too coarse to judge, it is quiet. */}
          {(row.lokasi || row.status === "Selesai" || row.status === "Tertunda") && (
            <ClosingDistance lokasi={row.lokasi} />
          )}
          {row.catatan && (
            <span className="mt-1 block text-2xs leading-snug text-ink-muted">
              {row.catatan}
            </span>
          )}
        </>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.status === "Antrian" && (
            <Button
              size="xs"
              variant="outline"
              onClick={() => onStart(row)}
              disabled={pendingId === row.id}
            >
              <PlayCircle className="h-3 w-3" />
              Berangkat
            </Button>
          )}
          {(row.status === "Proses" || row.status === "Antrian") && (
            <>
              <Button
                size="xs"
                onClick={() => onComplete(row)}
                disabled={pendingId === row.id}
              >
                <CheckCircle2 className="h-3 w-3" />
                Selesai
              </Button>
              <Button
                size="xs"
                variant="ghost"
                onClick={() => onHold(row)}
                disabled={pendingId === row.id}
                className="hover:bg-rust-soft hover:text-rust-ink"
                title="Tandai tertunda"
                aria-label={`Tandai ${row.kode} tertunda`}
              >
                <TriangleAlert className="h-3 w-3" />
              </Button>
            </>
          )}
          {row.status === "Selesai" && <DeliveryPhotosButton row={row} />}
          <Button
            size="icon-xs"
            variant="ghost"
            onClick={() => onPrint(row)}
            title="Cetak surat jalan"
            aria-label={`Cetak ${row.kode}`}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      rowKey={(row) => row.id}
      spineFor={(row) => spineFor(row.status)}
      pageSize={12}
      defaultSortKey="kode"
      emptyIcon={Route}
      emptyMessage="Tidak ada surat jalan"
      emptyDescription="Ubah rentang tanggal, atau konfirmasi rencana distribusi untuk menerbitkan surat jalan."
      dense
    />
  );
}

/**
 * `lokasi` is absent on a closed stop when nothing filed a position: the
 * office closed it (a desk files none, by design), or the driver's phone gave
 * no fix. Said as such, so no closed row is silently without a distance.
 */
function ClosingDistance({ lokasi }: { lokasi?: FilingLocation }) {
  if (!lokasi) {
    return (
      <span
        className="mt-1 flex items-start gap-1 text-2xs leading-snug text-ink-muted"
        title="Ditutup dari kantor, atau ponsel sopir tidak mengirim lokasi"
      >
        <Crosshair className="mt-px h-3 w-3 shrink-0" aria-hidden />
        <span>Lokasi penutupan tidak terekam</span>
      </span>
    );
  }
  const known = lokasi.verdict !== "tanpa-lokasi" && lokasi.jarakMeter != null;
  const radius = `radius ${formatDistance(lokasi.radiusMeter)}`;
  const accuracy = lokasi.akurasiMeter ? `akurasi GPS ±${formatDistance(lokasi.akurasiMeter)}` : undefined;
  const title = !known
    ? "Lokasi saat penutupan tidak dapat dipastikan"
    : lokasi.verdict === "jauh"
      ? `Surat jalan ditutup di luar ${radius} titik ${outletLabel()}`
      : lokasi.verdict === "kasar"
        ? `Sinyal GPS terlalu kasar untuk memastikan ${radius}`
        : `Di dalam ${radius} titik ${outletLabel()}`;
  return (
    <span
      className={cn(
        "mt-1 flex items-start gap-1 text-2xs leading-snug",
        lokasi.verdict === "jauh" ? "font-semibold text-rust-ink" : "text-ink-muted",
      )}
      title={[title, accuracy].filter(Boolean).join(" · ")}
    >
      <Crosshair className="mt-px h-3 w-3 shrink-0" aria-hidden />
      <span>
        {known ? `Ditutup ${formatDistance(lokasi.jarakMeter!)} dari ${outletLabel()}` : "Lokasi penutupan tidak terekam"}
        {known && lokasi.verdict === "kasar" && accuracy && <span className="block">{accuracy}</span>}
      </span>
    </span>
  );
}
