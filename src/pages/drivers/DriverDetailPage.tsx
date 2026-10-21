import { scopeKey } from "@/lib/scope";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, IdCard, Phone, Route, Truck } from "lucide-react";
import {
  getDriverDetail,
  getDriverSchedule,
} from "@/features/drivers/api/driverApi";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Meter, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { EmptyState } from "@/components/common/EmptyState";
import { Button } from "@/components/ui/button";
import { formatDateId, formatNumber, formatPercentId } from "@/lib/format";
import { outletLabel, unitLabel } from "@/lib/lexicon";

type StopRow = Awaited<ReturnType<typeof getDriverSchedule>>[number];

const columns: Column<StopRow>[] = [
  {
    key: "jam",
    header: "Jam",
    width: "5rem",
    render: (row) => <span className="data text-ink">{row.jam}</span>,
    sortValue: (row) => row.jam,
  },
  {
    key: "kode",
    header: "Surat jalan",
    render: (row) => <span className="data text-xs text-ink-muted">{row.kode}</span>,
  },
  {
    key: outletLabel(),
    header: "Tujuan",
    render: (row) => (
      <>
        <span className="block font-medium text-ink">{row.outlet}</span>
        <span className="block text-xs text-ink-muted">Kec. {row.kecamatan}</span>
      </>
    ),
    sortValue: (row) => row.outlet,
  },
  {
    key: "muatan",
    header: "Realisasi / target",
    align: "right",
    render: (row) => (
      <span className="data text-ink">
        {formatNumber(row.realisasi)}
        <span className="text-ink-muted"> / {formatNumber(row.target)}</span>
      </span>
    ),
    sortValue: (row) => row.target,
  },
  {
    key: "status",
    header: "Status",
    width: "8rem",
    render: (row) => (
      <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
    ),
  },
];

export function DriverDetailPage() {
  const { id = "" } = useParams();
  const navigate = useNavigate();

  const detail = useQuery({
    queryKey: [...scopeKey(), "driver-detail", id],
    queryFn: () => getDriverDetail(id),
  });

  const schedule = useQuery({
    queryKey: [...scopeKey(), "driver-schedule", id],
    queryFn: () => getDriverSchedule(id),
    refetchInterval: 30_000,
  });

  if (detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-32 w-full" />
        <Skeleton className="h-64 w-full" />
      </div>
    );
  }

  if (detail.isError || !detail.data) {
    return (
      <Panel>
        <EmptyState
          icon={Truck}
          title="Sopir tidak ditemukan"
          description="Data mungkin sudah dihapus. Kembali ke daftar armada untuk memilih yang lain."
          action={
            <Button asChild size="sm">
              <Link to="/drivers">Ke daftar armada</Link>
            </Button>
          }
        />
      </Panel>
    );
  }

  const d = detail.data;

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali
      </Button>

      <PageHeader
        eyebrow={`SIM ${d.nomorSim}`}
        title={d.nama}
        description={`Bergabung ${formatDateId(d.bergabungPada)}. Armada ditetapkan per rit di papan berangkat.`}
        meta={<StatusBadge variant={getStatusVariant(d.status)} label={d.status} />}
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {/*
          A load with no ceiling beside it. Utilisation needs a capacity, a
          capacity belongs to a truck, and which truck this driver is out in is
          a fact about today's run rather than about them -- the dispatch board
          is what knows it, and the fleet list is where capacity lives.
        */}
        <Stat
          label="Muatan hari ini"
          value={formatNumber(d.muatanHariIni)}
          unit={unitLabel()}
          hint="Kapasitas mengikuti armada yang ditugaskan hari ini"
        />
        <Stat
          label="Pemberhentian hari ini"
          value={`${d.selesaiHariIni}/${d.tugasHariIni}`}
          unit="selesai"
          hint={
            d.tugasHariIni === 0
              ? "Tidak ada penugasan hari ini"
              : "Diperbarui otomatis saat armada bergerak"
          }
        />
        <Stat
          label="Pengiriman 30 hari"
          value={formatNumber(d.pengiriman30Hari)}
          unit="surat jalan"
          hint={`${formatNumber(d.unit30Hari)} ${unitLabel()} terkirim`}
        />
        <Stat
          label="Ketepatan penyelesaian"
          value={formatPercentId(d.ketepatan * 100)}
          hint="Surat jalan selesai dibanding yang ditutup"
        />
      </div>

      <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
        <Panel>
          <PanelHeader title="Data sopir" />
          <PanelBody className="space-y-3 text-sm">
            {/*
              The panel used to name a truck. There is no truck to name: a
              driver swaps vehicles and a vehicle swaps drivers, so the pairing
              is recorded on the run and read from the dispatch board.
            */}
            <p className="flex items-center gap-2.5 text-ink-muted">
              <Truck className="h-4 w-4 shrink-0" />
              Armada ditetapkan per rit
              <Link to="/distribution" className="ml-auto text-xs underline">
                Papan berangkat
              </Link>
            </p>
            <p className="flex items-center gap-2.5 text-ink">
              <IdCard className="h-4 w-4 shrink-0 text-ink-muted" />
              SIM <span className="data">{d.nomorSim || "—"}</span>
            </p>
            <a
              href={`tel:${d.telepon}`}
              className="flex items-center gap-2.5 text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
            >
              <Phone className="h-4 w-4 shrink-0 text-ink-muted" />
              <span className="data">{d.telepon || "—"}</span>
            </a>
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Rute hari ini"
            hint="Urut menurut jam berangkat"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/monitoring">Buka monitoring</Link>
              </Button>
            }
          />
          <DataTable
            columns={columns}
            data={schedule.data ?? []}
            isLoading={schedule.isLoading}
            rowKey={(row) => row.id}
            spineFor={(row) => spineFor(row.status)}
            emptyIcon={Route}
            emptyMessage="Tidak ada penugasan hari ini"
            emptyDescription="Tetapkan armada ini pada rencana distribusi untuk mengisi rutenya."
            emptyAction={
              <Button asChild size="sm">
                <Link to="/distribution">Buka perencanaan</Link>
              </Button>
            }
            dense
          />
        </Panel>
      </div>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
  meter,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  meter?: { value: number; max: number };
}) {
  return (
    <div className="rounded-md border border-line bg-panel p-4">
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p className="data mt-1.5 truncate text-figure font-semibold text-ink">
        {value}
        {unit && (
          <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
            {unit}
          </span>
        )}
      </p>
      {meter && (
        <Meter className="mt-3" value={meter.value} max={meter.max} label={label} />
      )}
      {hint && <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}
