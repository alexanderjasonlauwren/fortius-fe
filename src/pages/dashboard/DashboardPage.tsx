import { Link } from "react-router-dom";
import {
  ArrowRight,
  ClipboardList,
  Package,
  RefreshCw,
  TriangleAlert,
  Wallet,
} from "lucide-react";
import { useDashboard } from "@/features/dashboard/hooks/useDashboard";
import { useFinanceSummary } from "@/features/dashboard/hooks/useFinanceSummary";
import { FinanceSummary } from "@/features/dashboard/components/FinanceSummary";
import { DispatchRail } from "@/features/dashboard/components/DispatchRail";
import { MonthlyBarChart } from "@/features/dashboard/components/MonthlyBarChart";
import { WilayahShareChart } from "@/features/dashboard/components/WilayahShareChart";
import { Panel, PanelBody, PanelHeader, Meter, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatDateLong,
  formatDelta,
  formatNumber,
  formatPercentId,
  formatRupiahShort,
  minutesToClock,
  relativeTime,
} from "@/lib/format";
import type { RecentActivity } from "@/features/dashboard/types";
import { outletLabel, outletLabelTitle, unitLabel, unitLabelTitle } from "@/lib/lexicon";

const activityColumns: Column<RecentActivity>[] = [
  {
    key: "tanggal",
    header: "Jadwal",
    width: "8rem",
    render: (row) => <span className="data text-xs text-ink-muted">{row.tanggal}</span>,
    sortValue: (row) => row.tanggal,
  },
  {
    key: outletLabel(),
    header: outletLabelTitle(),
    render: (row) => <span className="font-medium text-ink">{row.outlet}</span>,
    sortValue: (row) => row.outlet,
  },
  {
    key: "driver",
    header: "Driver",
    render: (row) => <span className="text-ink-muted">{row.driver}</span>,
    sortValue: (row) => row.driver,
  },
  {
    key: "jumlahUnit",
    header: unitLabelTitle(),
    align: "right",
    width: "7rem",
    render: (row) => (
      <span className="data font-semibold text-ink">{formatNumber(row.jumlahUnit)}</span>
    ),
    sortValue: (row) => row.jumlahUnit,
  },
  {
    key: "status",
    header: "Status",
    width: "10rem",
    render: (row) => (
      <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
    ),
  },
];

export function DashboardPage() {
  const finance = useFinanceSummary();
  const {
    showManualOrders,
    kpi,
    rail,
    monthlyChart,
    outletShares,
    recentActivities,
    audit,
    isLoading,
    isLoadingCharts,
    isLoadingActivities,
    refetch,
  } = useDashboard();

  const delta = kpi ? formatDelta(kpi.dailyDistributed, kpi.previousDayDistributed) : null;
  const quotaUsed = kpi ? kpi.monthlyQuotaTotal - kpi.monthlyQuotaRemaining : 0;
  const outsideHours =
    !!rail && (rail.nowMinute < rail.dayStart || rail.nowMinute > rail.dayEnd);

  return (
    <div className="space-y-6">
      {/* ── Dispatch rail: the day at a glance ── */}
      <Panel>
        <PanelHeader
          title="Papan berangkat"
          hint={
            <>
              {formatDateLong(new Date())}
              {outsideHours && (
                <>
                  {" · "}
                  <span className="text-signal-ink">
                    Di luar jam operasional. Armada berangkat mulai pukul{" "}
                    {minutesToClock(rail!.dayStart)}.
                  </span>
                </>
              )}
            </>
          }
          actions={
            <>
              <RailLegend />
              <Button variant="ghost" size="sm" onClick={() => { refetch(); finance.refetch(); }}>
                <RefreshCw className="h-3.5 w-3.5" />
                Muat ulang
              </Button>
            </>
          }
        />
        <DispatchRail data={rail} isLoading={isLoading} />
        {rail && rail.idleDrivers.length > 0 && (
          <p className="border-t border-line px-5 py-2.5 text-xs text-ink-muted">
            Tanpa penugasan hari ini:{" "}
            {rail.idleDrivers.map((d, i) => (
              <span key={d.id}>
                {i > 0 && ", "}
                <Link
                  to={`/drivers/${d.id}`}
                  className="text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
                >
                  {d.nama}
                </Link>
                <span className="data text-ink-muted"> ({d.plat})</span>
              </span>
            ))}
            .
          </p>
        )}
      </Panel>

      {/* ── Four numbers that decide what to do next ── */}
      <div className={cn("grid grid-cols-1 gap-4 sm:grid-cols-2", showManualOrders ? "xl:grid-cols-4" : "xl:grid-cols-3")}>
        <StatTile
          label="Terkirim hari ini"
          value={kpi ? formatNumber(kpi.dailyDistributed) : undefined}
          unit={unitLabel()}
          isLoading={isLoading}
          meter={kpi ? { value: kpi.dailyDistributed, max: kpi.dailyTarget } : undefined}
          hint={
            kpi ? (
              <>
                <span className="data">{formatNumber(kpi.dailyTarget)}</span> ditargetkan ·{" "}
                <span
                  className={cn(
                    delta?.tone === "up" && "text-pine-ink",
                    delta?.tone === "down" && "text-rust-ink",
                  )}
                >
                  {delta?.label}
                </span>
              </>
            ) : undefined
          }
        />

        <StatTile
          label="Sisa kuota bulan ini"
          value={kpi ? formatNumber(kpi.monthlyQuotaRemaining) : undefined}
          unit={unitLabel()}
          isLoading={isLoading}
          meter={
            kpi ? { value: quotaUsed, max: kpi.monthlyQuotaTotal, tone: "ink" as const } : undefined
          }
          hint={
            kpi ? (
              <>
                <span className="data">{formatNumber(quotaUsed)}</span> dari{" "}
                <span className="data">{formatNumber(kpi.monthlyQuotaTotal)}</span> sudah ditarik
              </>
            ) : undefined
          }
          href="/sa"
          icon={Package}
        />

        {showManualOrders ? <StatTile
          label="Pesanan menunggu"
          value={kpi ? formatNumber(kpi.openOrders) : undefined}
          unit={kpi?.openOrders === 1 ? "pesanan" : "pesanan"}
          isLoading={isLoading}
          hint="Belum disetujui, belum bisa dijadwalkan"
          href="/orders"
          icon={ClipboardList}
          tone={kpi && kpi.openOrders > 0 ? "signal" : undefined}
        /> : null}

        <StatTile
          label="Pembayaran belum diverifikasi"
          value={kpi ? formatNumber(kpi.pendingPayments) : undefined}
          unit="faktur"
          isLoading={isLoading}
          hint={
            kpi ? (
              <>
                Senilai{" "}
                <span className="data">{formatRupiahShort(kpi.pendingPaymentValue)}</span>
              </>
            ) : undefined
          }
          href="/payments"
          icon={Wallet}
          tone={kpi && kpi.pendingPayments > 0 ? "signal" : undefined}
        />
      </div>

      <FinanceSummary summary={finance} />

      {kpi && kpi.lateDeliveries > 0 && (
        <Panel spine="text-rust" className="flex items-center gap-3 px-5 py-3.5">
          <TriangleAlert className="h-4 w-4 shrink-0 text-rust-ink" />
          <p className="flex-1 text-sm text-ink">
            <span className="font-semibold">
              {kpi.lateDeliveries} surat jalan tertunda hari ini.
            </span>{" "}
            <span className="text-ink-muted">
              {outletLabelTitle()} tidak menerima muatan sesuai jadwal.
            </span>
          </p>
          <Button asChild size="sm" variant="outline">
            <Link to="/monitoring">Tinjau di monitoring</Link>
          </Button>
        </Panel>
      )}

      {/* ── Month to date ── */}
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-5">
        <Panel className="lg:col-span-3">
          <PanelHeader
            title="Realisasi terhadap target"
            hint="Per minggu, bulan berjalan"
          />
          <PanelBody>
            {isLoadingCharts ? (
              <Skeleton className="h-[260px] w-full" />
            ) : (
              <MonthlyBarChart data={monthlyChart} />
            )}
          </PanelBody>
        </Panel>

        <Panel className="lg:col-span-2">
          <PanelHeader title="Sebaran wilayah" hint="Realisasi per kecamatan" />
          <PanelBody>
            <WilayahShareChart data={outletShares} isLoading={isLoadingCharts} />
          </PanelBody>
        </Panel>
      </div>

      {/* ── Today's stops and the audit trail ── */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-3">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Surat jalan hari ini"
            hint="Delapan pemberhentian terakhir menurut jadwal"
            actions={
              <Button asChild variant="ghost" size="sm">
                <Link to="/monitoring">
                  Semua surat jalan
                  <ArrowRight className="h-3.5 w-3.5" />
                </Link>
              </Button>
            }
          />
          <DataTable
            columns={activityColumns}
            data={recentActivities}
            isLoading={isLoadingActivities}
            rowKey={(row) => row.id}
            spineFor={(row) => spineFor(row.status)}
            emptyMessage="Belum ada surat jalan hari ini"
            emptyDescription="Konfirmasi rencana distribusi untuk menerbitkan surat jalan."
            emptyAction={
              <Button asChild size="sm">
                <Link to="/distribution">Buka perencanaan</Link>
              </Button>
            }
            dense
          />
        </Panel>

        <Panel>
          <PanelHeader title="Jejak aktivitas" hint="Perubahan terakhir di sistem" />
          {audit.length === 0 ? (
            <p className="px-5 py-8 text-center text-sm text-ink-muted">
              Belum ada aktivitas tercatat pada sesi ini. Setiap konfirmasi,
              verifikasi, dan perubahan data induk akan muncul di sini.
            </p>
          ) : (
            <ul className="divide-y divide-line">
              {audit.map((entry) => (
                <li key={entry.id} className="px-5 py-3">
                  <p className="text-sm leading-snug text-ink">{entry.summary}</p>
                  <p className="mt-1 text-2xs text-ink-muted">
                    {entry.actor} ·{" "}
                    <span className="data">{relativeTime(entry.at)}</span>
                  </p>
                </li>
              ))}
            </ul>
          )}
        </Panel>
      </div>
    </div>
  );
}

function RailLegend() {
  const items = [
    { label: "Selesai", className: "bg-pine" },
    { label: "Berjalan", className: "bg-signal" },
    { label: "Antrian", className: "bg-panel-raised ring-1 ring-inset ring-line-strong" },
    { label: "Tertunda", className: "bg-rust" },
  ];
  return (
    <ul className="hidden items-center gap-3 sm:flex">
      {items.map((i) => (
        <li key={i.label} className="flex items-center gap-1.5">
          <span className={cn("h-2.5 w-2.5 rounded-[2px]", i.className)} aria-hidden />
          <span className="text-2xs text-ink-muted">{i.label}</span>
        </li>
      ))}
    </ul>
  );
}

function StatTile({
  label,
  value,
  unit,
  hint,
  meter,
  href,
  icon: Icon,
  tone,
  isLoading,
}: {
  label: string;
  value?: string;
  unit?: string;
  hint?: React.ReactNode;
  meter?: { value: number; max: number; tone?: "signal" | "pine" | "rust" | "ink" };
  href?: string;
  icon?: typeof Package;
  tone?: "signal";
  isLoading?: boolean;
}) {
  const body = (
    <>
      <div className="flex items-start justify-between gap-2">
        <p className="label text-2xs text-ink-muted">{label}</p>
        {Icon && <Icon className="h-4 w-4 shrink-0 text-ink-muted" strokeWidth={1.75} />}
      </div>

      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-2/3" />
      ) : (
        <p className="data mt-1.5 truncate text-figure font-semibold text-ink">
          {value ?? "—"}
          {unit && (
            <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
              {unit}
            </span>
          )}
        </p>
      )}

      {meter && !isLoading && (
        <Meter
          className="mt-3"
          value={meter.value}
          max={meter.max}
          tone={meter.tone ?? "signal"}
          label={`${label}: ${formatPercentId((meter.value / (meter.max || 1)) * 100)}`}
        />
      )}

      {hint && !isLoading && (
        <p className="mt-2.5 text-xs leading-relaxed text-ink-muted">{hint}</p>
      )}
    </>
  );

  const className = cn(
    "block rounded-md border border-line bg-panel p-4 transition-colors",
    href && "hover:border-line-strong",
    tone === "signal" && "spine text-signal",
  );

  return href ? (
    <Link to={href} className={className}>
      {body}
    </Link>
  ) : (
    <div className={className}>{body}</div>
  );
}
