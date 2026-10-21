import { scopeKey } from "@/lib/scope";
import { useSearchParams } from "react-router-dom";
import { reportRangeFromParam } from "@/features/reports/api/contract";
import { useQuery } from "@tanstack/react-query";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Legend,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { Download, Printer, TrendingUp } from "lucide-react";
import {
  exportReport,
  getDailySeries,
  getDriverPerformance,
  getReportSummary,
  getTopOutlet,
  printReport,
  RANGE_LABEL,
  resolveRange,
  type ReportRange,
} from "@/features/reports/api/reportApi";
import { getProfitAndLoss } from "@/features/finance/api/financeApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useTheme } from "@/hooks/useTheme";
import { useAuthStore } from "@/features/auth/store/authStore";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Meter, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ChartTooltip } from "@/components/common/ChartTooltip";
import { SegmentedControl } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { axisProps, chartTheme, compactUnit, seriesColor } from "@/lib/chart";
import {
  formatDateId,
  formatNumber,
  formatPercentId,
  formatRupiah,
  formatRupiahShort,
} from "@/lib/format";
import { outletLabelTitle, unitLabel, unitLabelTitle } from "@/lib/lexicon";

const RANGES: ReportRange[] = ["hari-ini", "7h", "30h", "bulan-ini", "bulan-lalu"];

type DriverRow = Awaited<ReturnType<typeof getDriverPerformance>>[number];
type TopRow = Awaited<ReturnType<typeof getTopOutlet>>[number];

export function ReportsPage() {
  const [searchParams, setSearchParams] = useSearchParams();
  const range = reportRangeFromParam(searchParams.get("range"));
  const setRange = (value: ReportRange) => setSearchParams((previous) => {
    const next = new URLSearchParams(previous);
    next.set("range", value);
    return next;
  }, { replace: true });
  const { isDark } = useTheme();
  const t = chartTheme(isDark);

  const summary = useQuery({
    queryKey: [...scopeKey(), "report-summary", range],
    queryFn: () => getReportSummary(range),
  });
  const series = useQuery({
    queryKey: [...scopeKey(), "report-series", range],
    queryFn: () => getDailySeries(range),
  });
  const top = useQuery({
    queryKey: [...scopeKey(), "report-top", range],
    queryFn: () => getTopOutlet(range, 8),
  });
  const drivers = useQuery({
    queryKey: [...scopeKey(), "report-drivers", range],
    queryFn: () => getDriverPerformance(range),
  });
  // Realised margin is ledger data (revenue minus COGS, posted per delivery
  // as it's actually confirmed) — a different permission than the rest of
  // this page's INVOICES_VIEW-gated figures, so it is fetched only when held
  // and the tile simply does not render otherwise, rather than 403ing.
  const canSeeMargin = useAuthStore((state) => state.hasPermission(PERMISSIONS.JOURNALS_VIEW));
  const margin = useQuery({
    queryKey: [...scopeKey(), "report-margin", range],
    queryFn: () => getProfitAndLoss(resolveRange(range)),
    enabled: canSeeMargin,
  });

  const exportMutation = useDeskMutation({
    mutationFn: () => exportReport(range),
    errorTitle: "Unduh gagal",
    success: (count) => ({
      title: "Berkas CSV diunduh",
      description: `${count} hari data diekspor.`,
    }),
  });

  const printMutation = useDeskMutation({
    mutationFn: () => printReport(range),
    errorTitle: "Cetak gagal",
  });

  const s = summary.data;
  const hasOpeningRevenue = (series.data ?? []).some((p) => p.pendapatanSebelumGoLive > 0);
  const chartData = (series.data ?? []).map((p) => ({
    ...p,
    label: formatDateId(p.tanggal).replace(/ \d{4}$/, ""),
  }));

  const topColumns: Column<TopRow>[] = [
    {
      key: "nama",
      header: outletLabelTitle(),
      render: (row, i) => (
        <>
          <span className="flex items-baseline gap-2">
            <span className="data text-2xs text-ink-muted">{i + 1}</span>
            <span className="font-medium text-ink">{row.nama}</span>
          </span>
          <span className="block pl-5 text-xs text-ink-muted">Kec. {row.kecamatan}</span>
        </>
      ),
    },
    {
      key: "suratJalan",
      header: "Surat jalan",
      align: "right",
      render: (row) => <span className="data text-ink-muted">{formatNumber(row.suratJalan)}</span>,
      sortValue: (row) => row.suratJalan,
    },
    {
      key: "unit",
      header: unitLabelTitle(),
      align: "right",
      render: (row) => (
        <span className="data font-semibold text-ink">{formatNumber(row.unit)}</span>
      ),
      sortValue: (row) => row.unit,
    },
    {
      key: "nilai",
      header: "Nilai",
      align: "right",
      render: (row) => <span className="data text-ink">{formatRupiah(row.nilai)}</span>,
      sortValue: (row) => row.nilai,
    },
  ];

  const driverColumns: Column<DriverRow>[] = [
    {
      key: "nama",
      header: "Sopir",
      render: (row) => (
        <>
          <span className="block font-medium text-ink">{row.nama}</span>
          <span className="data block text-2xs text-ink-muted">
            {row.plat} · {row.armada}
          </span>
        </>
      ),
      sortValue: (row) => row.nama,
    },
    {
      key: "suratJalan",
      header: "Surat jalan",
      align: "right",
      render: (row) => (
        <span className="data text-ink">
          {formatNumber(row.selesai)}
          <span className="text-ink-muted"> / {formatNumber(row.suratJalan)}</span>
        </span>
      ),
      sortValue: (row) => row.suratJalan,
    },
    {
      key: "unit",
      header: unitLabelTitle(),
      align: "right",
      render: (row) => (
        <span className="data font-semibold text-ink">{formatNumber(row.unit)}</span>
      ),
      sortValue: (row) => row.unit,
    },
    {
      key: "ketepatan",
      header: "Ketepatan",
      width: "11rem",
      render: (row) => (
        <div className="min-w-[7rem]">
          <p className="data mb-1.5 text-xs text-ink-muted">
            {formatPercentId(row.ketepatan)}
            {row.tertunda > 0 && (
              <span className="ml-2 text-rust-ink">{row.tertunda} tertunda</span>
            )}
          </p>
          <Meter
            value={row.ketepatan}
            max={100}
            tone={row.ketepatan >= 95 ? "pine" : row.ketepatan >= 80 ? "signal" : "rust"}
            label={`Ketepatan ${row.nama}`}
          />
        </div>
      ),
      sortValue: (row) => row.ketepatan,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Rekap Operasional"
        description="Rekapitulasi distribusi dan pendapatan untuk periode yang dipilih, siap diunduh atau dicetak untuk arsip."
        actions={
          <>
            <CanAccess permission={PERMISSIONS.INVOICES_EXPORT}>
              <Button
                variant="outline"
                onClick={() => exportMutation.mutate(undefined as never)}
                disabled={exportMutation.isPending}
              >
                <Download className="h-3.5 w-3.5" />
                Unduh CSV
              </Button>
            </CanAccess>
            <Button
              onClick={() => printMutation.mutate(undefined as never)}
              disabled={printMutation.isPending}
            >
              <Printer className="h-3.5 w-3.5" />
              Cetak rekap
            </Button>
          </>
        }
        meta={
          <SegmentedControl
            value={range}
            onChange={setRange}
            options={RANGES.map((r) => ({ value: r, label: RANGE_LABEL[r] }))}
          />
        }
      />

      {s && (
        <p className="text-xs text-ink-muted">
          Periode <span className="data">{formatDateId(s.range.from)}</span> –{" "}
          <span className="data">{formatDateId(s.range.to)}</span> ·{" "}
          <span className="data">{formatNumber(s.suratJalan)}</span> surat jalan ·{" "}
          <span className="data">{formatNumber(s.outletDilayani)}</span> outlet
          dilayani
        </p>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label={`${unitLabelTitle()} terkirim`}
          value={formatNumber(s?.unitTerkirim ?? 0)}
          unit={unitLabel()}
          meter={s ? { value: s.unitTerkirim, max: s.unitTarget } : undefined}
          hint={
            s
              ? `${formatPercentId(s.pencapaian, 1)} dari target ${formatNumber(s.unitTarget)}`
              : undefined
          }
          isLoading={summary.isLoading}
        />
        <Stat
          label="Pendapatan terverifikasi"
          value={formatRupiahShort(s?.pendapatan ?? 0)}
          hint="Kas yang sudah diverifikasi, bukan akrual. Untuk laba rugi akrual, lihat Buku Besar"
          isLoading={summary.isLoading}
          tone="pine"
        />
        <Stat
          label="Piutang berjalan"
          value={formatRupiahShort(s?.piutang ?? 0)}
          hint="Tagihan terbit yang belum diverifikasi"
          isLoading={summary.isLoading}
          tone={s && s.piutang > 0 ? "signal" : undefined}
        />
        {s && s.pendapatanSebelumGoLive > 0 && (
          <Stat
            label="Pendapatan sebelum go-live"
            value={formatRupiahShort(s.pendapatanSebelumGoLive)}
            hint={`${formatNumber(s.unitSebelumGoLive)} ${unitLabel()} menurut SIM3LON, disalurkan dan dibayar di luar sistem sebelum tanggal mulai`}
            isLoading={summary.isLoading}
          />
        )}
        <Stat
          label="Rata-rata harian"
          value={formatNumber(s?.rerataPerHari ?? 0)}
          unit={unitLabel()}
          hint={
            s
              ? `${formatNumber(s.suratJalanTertunda)} surat jalan tertunda pada periode ini`
              : undefined
          }
          isLoading={summary.isLoading}
          tone={s && s.suratJalanTertunda > 0 ? "rust" : undefined}
        />
        {canSeeMargin && (
          <Stat
            label="Margin kotor"
            value={formatRupiahShort(margin.data?.labaKotor ?? 0)}
            hint="Pendapatan dikurangi harga pokok penjualan, dari surat jalan yang benar-benar terkirim"
            isLoading={margin.isLoading}
            tone="pine"
          />
        )}
      </div>

      {/* Two measures, two charts — never two y-axes on one plot. */}
      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader title="Volume harian" hint={`Realisasi terhadap target, dalam ${unitLabel()}`} />
          <PanelBody>
            {series.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <ResponsiveContainer debounce={120} width="100%" height={240}>
                <BarChart data={chartData} margin={{ top: 8, right: 8, left: -8, bottom: 0 }}>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps(isDark)} interval="preserveStartEnd" />
                  <YAxis {...axisProps(isDark)} tickFormatter={compactUnit} width={58} />
                  <Tooltip
                    cursor={{ fill: t.grid, fillOpacity: 0.45 }}
                    content={<ChartTooltip unit={unitLabel()} />}
                  />
                  <Legend
                    iconType="square"
                    iconSize={9}
                    wrapperStyle={{ fontSize: "11px", paddingTop: "10px", color: t.muted }}
                  />
                  <Bar dataKey="target" name="Target" fill={t.reference} maxBarSize={18} radius={[3, 3, 0, 0]} />
                  <Bar
                    dataKey="realisasi"
                    name="Realisasi"
                    fill={seriesColor(0, isDark)}
                    maxBarSize={18}
                    radius={[3, 3, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            )}
          </PanelBody>
        </Panel>

        <Panel>
          <PanelHeader
            title="Pendapatan harian"
            hint={hasOpeningRevenue
              ? "Pembayaran terverifikasi, ditambah penyaluran SIM3LON sebelum go-live"
              : "Nilai pembayaran yang diverifikasi pada hari itu"}
          />
          <PanelBody>
            {series.isLoading ? (
              <Skeleton className="h-[240px] w-full" />
            ) : (
              <ResponsiveContainer debounce={120} width="100%" height={240}>
                <AreaChart data={chartData} margin={{ top: 8, right: 8, left: 4, bottom: 0 }}>
                  <defs>
                    <linearGradient id="pendapatan" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor={seriesColor(1, isDark)} stopOpacity={0.28} />
                      <stop offset="100%" stopColor={seriesColor(1, isDark)} stopOpacity={0.02} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid stroke={t.grid} vertical={false} />
                  <XAxis dataKey="label" {...axisProps(isDark)} interval="preserveStartEnd" />
                  <YAxis
                    {...axisProps(isDark)}
                    width={64}
                    tickFormatter={(v: number) => formatRupiahShort(v).replace("Rp ", "")}
                  />
                  <Tooltip
                    cursor={{ stroke: t.axis, strokeWidth: 1 }}
                    content={
                      <ChartTooltip unit="" formatValue={(v) => formatRupiah(v)} />
                    }
                  />
                  <Area
                    type="monotone"
                    dataKey="pendapatan"
                    name="Pendapatan"
                    stroke={seriesColor(1, isDark)}
                    strokeWidth={2}
                    fill="url(#pendapatan)"
                    dot={false}
                    activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface }}
                  />
                  {hasOpeningRevenue && (
                    <Area
                      type="monotone"
                      dataKey="pendapatanSebelumGoLive"
                      name="Sebelum go-live (SIM3LON)"
                      stroke={seriesColor(2, isDark)}
                      strokeWidth={2}
                      strokeDasharray="4 3"
                      fill="none"
                      dot={false}
                      activeDot={{ r: 4, strokeWidth: 2, stroke: t.surface }}
                    />
                  )}
                </AreaChart>
              </ResponsiveContainer>
            )}
          </PanelBody>
        </Panel>
      </div>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        <Panel>
          <PanelHeader
            title={`${outletLabelTitle()} teratas`}
            hint={`Menurut ${unitLabel()} yang diberangkatkan`}
          />
          <DataTable
            columns={topColumns}
            data={top.data ?? []}
            isLoading={top.isLoading}
            rowKey={(row) => row.id}
            emptyIcon={TrendingUp}
            emptyMessage="Belum ada pengiriman pada periode ini"
            emptyDescription="Pilih rentang lain, atau konfirmasi rencana distribusi untuk mengisi data."
            dense
          />
        </Panel>

        <Panel>
          <PanelHeader title="Kinerja armada" hint="Surat jalan diselesaikan per sopir" />
          <DataTable
            columns={driverColumns}
            data={drivers.data ?? []}
            isLoading={drivers.isLoading}
            rowKey={(row) => row.id}
            defaultSortKey={`${unitLabel()}`}
            defaultSortDir="desc"
            emptyIcon={TrendingUp}
            emptyMessage="Belum ada armada yang bertugas"
            emptyDescription="Data kinerja muncul setelah surat jalan pertama ditutup."
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
  tone,
  isLoading,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  meter?: { value: number; max: number };
  tone?: "signal" | "pine" | "rust";
  isLoading?: boolean;
}) {
  const spine = {
    signal: "spine text-signal",
    pine: "spine text-pine",
    rust: "spine text-rust",
  };
  return (
    <div
      className={`rounded-md border border-line bg-panel p-4 ${tone ? spine[tone] : ""}`}
    >
      <p className="label text-2xs text-ink-muted">{label}</p>
      {isLoading ? (
        <Skeleton className="mt-2 h-8 w-2/3" />
      ) : (
        <p className="data mt-1.5 truncate text-figure font-semibold text-ink">
          {value}
          {unit && (
            <span className="ml-1.5 font-sans text-sm font-medium tracking-normal text-ink-muted">
              {unit}
            </span>
          )}
        </p>
      )}
      {meter && !isLoading && (
        <Meter className="mt-3" value={meter.value} max={meter.max} label={label} />
      )}
      {hint && !isLoading && (
        <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>
      )}
    </div>
  );
}
