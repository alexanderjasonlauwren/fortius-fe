/**
 * Dasbor Keuangan (client requirement §11.1, accounting parity P6): kas &
 * bank, piutang and hutang by age, this month's Laba Rugi against last
 * month's, and twelve months of revenue and profit. Every figure is read off
 * a report or the Laba Rugi and links to it -- the dashboard computes
 * nothing the reports do not already show.
 */
import { Link } from "react-router-dom";
import { useQueries, useQuery } from "@tanstack/react-query";
import { ArrowRight } from "lucide-react";
import {
  Bar,
  CartesianGrid,
  ComposedChart,
  Legend,
  Line,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import { getFinanceReport } from "@/features/financereports/api/financereportsApi";
import { todayIso } from "@/features/financereports/lib/period";
import { getProfitAndLoss } from "@/features/financialstatements/api/financialstatementsApi";
import {
  agingSplit,
  monthWindows,
  profitSummary,
  reportTotal,
  type AgingSplit,
  type ProfitSummary,
} from "@/features/financedashboard/lib/summary";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { ChartTooltip } from "@/components/common/ChartTooltip";
import { Button } from "@/components/ui/button";
import { useTheme } from "@/hooks/useTheme";
import { axisProps, chartTheme, seriesColor } from "@/lib/chart";
import { formatDateId, formatRupiah, formatRupiahShort } from "@/lib/format";
import { scopeKey } from "@/lib/scope";
import { cn } from "@/lib/utils";

export function FinanceDashboardPage() {
  const today = todayIso();
  const months = monthWindows(today, 12);
  const thisMonth = months[11];
  const lastMonth = months[10];
  const key = [...scopeKey(), "finance-dashboard"];

  const bank = useQuery({
    queryKey: [...key, "bank", thisMonth.from, today],
    queryFn: () => getFinanceReport("bank_summary", { from: thisMonth.from, to: today }),
  });
  const ar = useQuery({ queryKey: [...key, "ar", today], queryFn: () => getFinanceReport("ar_aging", { asOf: today }) });
  const ap = useQuery({ queryKey: [...key, "ap", today], queryFn: () => getFinanceReport("ap_aging", { asOf: today }) });
  const pl = useQueries({
    queries: months.map((m) => ({
      queryKey: [...key, "pl", m.from, m.to],
      queryFn: () => getProfitAndLoss({ from: m.from, to: m.to }),
    })),
  });

  const current = profitSummary(pl[11]?.data?.lines);
  const previous = profitSummary(pl[10]?.data?.lines);
  const trend = months.map((m, i) => {
    const s = profitSummary(pl[i]?.data?.lines);
    return { label: m.label, pendapatan: s.pendapatan ?? 0, labaBersih: s.labaBersih ?? 0 };
  });
  const receivable = agingSplit(ar.data);
  const payable = agingSplit(ap.data);
  const accounts = (bank.data?.rows ?? []).filter((r) => r.kind === "line");

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Menu utama"
        title="Dasbor Keuangan"
        description={`Posisi per ${formatDateId(today)}, seluruh cabang. Setiap angka diambil dari laporan yang ditautkan -- klik untuk rinciannya.`}
      />

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Tile label="Kas & bank" to="/laporan/bank_summary" loading={bank.isPending}
          value={reportTotal(bank.data, "closing")}
          hint={`Masuk ${formatRupiahShort(reportTotal(bank.data, "in"))} · keluar ${formatRupiahShort(reportTotal(bank.data, "out"))} bulan ini`} />
        <Tile label="Piutang" to="/laporan/ar_aging" loading={ar.isPending} value={receivable.total}
          hint={`${formatRupiahShort(receivable.overdue)} lewat jatuh tempo`} alert={receivable.overdue > 0} />
        <Tile label="Hutang" to="/laporan/ap_aging" loading={ap.isPending} value={payable.total}
          hint={`${formatRupiahShort(payable.overdue)} lewat jatuh tempo`} alert={payable.overdue > 0} />
        <Tile label="Laba bersih bulan ini" to="/financial-statements?tab=laba-rugi" loading={pl[11]?.isPending ?? true}
          value={current.labaBersih}
          hint={current.ebitda === null ? "Format laba rugi tanpa EBITDA" : `EBITDA ${formatRupiahShort(current.ebitda)}`} />
      </div>

      <div className="grid gap-5 xl:grid-cols-5">
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Laba rugi ringkas"
            hint={`${thisMonth.label} (s.d. ${formatDateId(today)}) dibanding ${lastMonth.label}`}
            actions={<GoTo to="/financial-statements?tab=laba-rugi" />}
          />
          {pl[11]?.isPending ? <Skeleton className="h-64 w-full" /> : <ProfitTable current={current} previous={previous} />}
        </Panel>
        <Panel className="xl:col-span-3">
          <PanelHeader title="Tren 12 bulan" hint="Pendapatan dan laba bersih per bulan" />
          <div className="p-4">
            {pl.some((q) => q.isPending) ? <Skeleton className="h-64 w-full" /> : <TrendChart data={trend} />}
          </div>
        </Panel>
      </div>

      <div className="grid gap-5 xl:grid-cols-3">
        <Panel>
          <PanelHeader title="Kas & bank per rekening" hint={`Saldo per ${formatDateId(today)}`} actions={<GoTo to="/laporan/bank_summary" />} />
          {bank.isPending ? <Skeleton className="h-40 w-full" /> : (
            <ul className="divide-y divide-line">
              {accounts.length === 0 && <li className="p-4 text-sm text-ink-muted">Belum ada rekening kas atau bank.</li>}
              {accounts.map((r, i) => (
                <li key={i} className="flex items-center justify-between gap-3 px-4 py-2.5 text-sm">
                  <span className="min-w-0 truncate text-ink">{String(r.cells.label ?? "")}</span>
                  <span className="data shrink-0 text-ink">{formatRupiah(Number(r.cells.closing ?? 0))}</span>
                </li>
              ))}
            </ul>
          )}
        </Panel>
        <Panel>
          <PanelHeader title="Umur piutang" hint={`Per ${formatDateId(today)}`} actions={<GoTo to="/laporan/ar_aging" />} />
          {ar.isPending ? <Skeleton className="h-40 w-full" /> : <AgingBars split={receivable} />}
        </Panel>
        <Panel>
          <PanelHeader title="Umur hutang" hint={`Per ${formatDateId(today)}`} actions={<GoTo to="/laporan/ap_aging" />} />
          {ap.isPending ? <Skeleton className="h-40 w-full" /> : <AgingBars split={payable} />}
        </Panel>
      </div>
    </div>
  );
}

function GoTo({ to }: { to: string }) {
  return (
    <Button asChild variant="ghost" size="sm">
      <Link to={to}>Rincian <ArrowRight className="h-3.5 w-3.5" /></Link>
    </Button>
  );
}

function Tile({ label, value, hint, to, loading, alert }: {
  label: string; value: number | null; hint: string; to: string; loading: boolean; alert?: boolean;
}) {
  return (
    <Link to={to} className="block rounded-md border border-line bg-panel p-4 transition-colors hover:border-line-strong">
      <p className="label text-2xs text-ink-muted">{label}</p>
      {loading ? <Skeleton className="mt-2 h-8 w-32" /> : (
        <p className="data mt-1.5 truncate text-2xl font-semibold text-ink" title={value === null ? undefined : formatRupiah(value)}>
          {value === null ? "—" : formatRupiahShort(value)}
        </p>
      )}
      <p className={cn("mt-2 text-xs", alert ? "text-rust-ink" : "text-ink-muted")}>{hint}</p>
    </Link>
  );
}

const PROFIT_ROWS: { key: keyof ProfitSummary; label: string; strong?: boolean; cost?: boolean }[] = [
  { key: "pendapatan", label: "Pendapatan" },
  { key: "hpp", label: "HPP", cost: true },
  { key: "labaKotor", label: "Laba kotor", strong: true },
  { key: "biayaOperasional", label: "Biaya operasional", cost: true },
  { key: "ebitda", label: "EBITDA", strong: true },
  { key: "labaBersih", label: "Laba bersih", strong: true },
];

function ProfitTable({ current, previous }: { current: ProfitSummary; previous: ProfitSummary }) {
  return (
    <table className="w-full text-sm">
      <thead>
        <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-muted">
          <th className="px-4 py-2 text-left font-semibold" />
          <th className="px-4 py-2 text-right font-semibold">Bulan ini</th>
          <th className="px-4 py-2 text-right font-semibold">Bulan lalu</th>
        </tr>
      </thead>
      <tbody>
        {PROFIT_ROWS.filter((r) => current[r.key] !== null || previous[r.key] !== null).map((r) => (
          <tr key={r.key} className={cn("border-b border-line", r.strong && "font-semibold")}>
            <td className="px-4 py-2 text-ink">{r.label}</td>
            <td className="data px-4 py-2 text-right text-ink">{money(current[r.key], r.cost)}</td>
            <td className="data px-4 py-2 text-right text-ink-muted">{money(previous[r.key], r.cost)}</td>
          </tr>
        ))}
      </tbody>
    </table>
  );
}

function money(v: number | null, cost?: boolean): string {
  if (v === null) return "—";
  if (v === 0) return "—";
  const text = formatRupiahShort(Math.abs(v));
  return cost || v < 0 ? `(${text})` : text;
}

function TrendChart({ data }: { data: { label: string; pendapatan: number; labaBersih: number }[] }) {
  const { isDark } = useTheme();
  const t = chartTheme(isDark);
  return (
    <ResponsiveContainer debounce={120} width="100%" height={260}>
      <ComposedChart data={data} margin={{ top: 8, right: 8, left: 8, bottom: 0 }}>
        <CartesianGrid stroke={t.grid} vertical={false} />
        <XAxis dataKey="label" {...axisProps(isDark)} />
        <YAxis {...axisProps(isDark)} tickFormatter={(v: number) => formatRupiahShort(v).replace("Rp ", "")} width={58} />
        <Tooltip
          cursor={{ fill: t.grid, fillOpacity: 0.45 }}
          content={<ChartTooltip unit="" formatValue={(v) => formatRupiah(v)} />}
        />
        <Legend iconType="square" iconSize={9} wrapperStyle={{ fontSize: "11px", paddingTop: "10px", color: t.muted }} />
        <Bar dataKey="pendapatan" name="Pendapatan" fill={t.reference} radius={[3, 3, 0, 0]} maxBarSize={26} />
        <Line dataKey="labaBersih" name="Laba bersih" stroke={seriesColor(0, isDark)} strokeWidth={2} dot={{ r: 2.5 }} />
      </ComposedChart>
    </ResponsiveContainer>
  );
}

function AgingBars({ split }: { split: AgingSplit }) {
  const max = Math.max(1, ...split.buckets.map((b) => b.amount));
  return (
    <div className="space-y-2.5 p-4">
      {split.buckets.map((b) => (
        <div key={b.key}>
          <div className="flex justify-between text-xs">
            <span className="text-ink-muted">{b.label}</span>
            <span className="data text-ink">{b.amount ? formatRupiahShort(b.amount) : "—"}</span>
          </div>
          <div className="mt-1 h-1.5 rounded-full bg-panel-sunk">
            <div
              className={cn("h-1.5 rounded-full", b.key === "current" ? "bg-pine" : "bg-rust")}
              style={{ width: `${(b.amount / max) * 100}%` }}
            />
          </div>
        </div>
      ))}
      <div className="flex justify-between border-t border-line pt-2 text-sm font-semibold">
        <span className="text-ink">Jumlah</span>
        <span className="data text-ink">{formatRupiah(split.total)}</span>
      </div>
    </div>
  );
}
