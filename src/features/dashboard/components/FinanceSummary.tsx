import { Link } from "react-router-dom";
import { ArrowRight } from "lucide-react";
import type { UseQueryResult } from "@tanstack/react-query";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { formatDateId, formatRupiah, formatRupiahShort } from "@/lib/format";
import { cn } from "@/lib/utils";
import type { FinanceTotal } from "../api/financeSummary.contract";
import type { useFinanceSummary } from "../hooks/useFinanceSummary";

export function FinanceSummary({ summary }: { summary: ReturnType<typeof useFinanceSummary> }) {
  const { window, cash, receivables, margin, bank, overdueReceivables, payablesDue,
    canSeeCash, canSeeReceivables, canSeeMargin, canSeeReports, canSeeDashboard } = summary;
  if (!canSeeCash && !canSeeReceivables && !canSeeMargin && !canSeeReports) return null;

  return (
    <Panel aria-label="Ringkasan keuangan">
      <PanelHeader
        title="Ringkasan keuangan"
        hint={<>{canSeeReports ? "Posisi hari ini" : "Bulan berjalan"} · <span className="data">{formatDateId(window.from)} – {formatDateId(window.to)}</span>
          <span className="block mt-1">Seluruh cabang dalam cakupan akses, bukan filter cabang di atas.</span>
        </>}
        actions={(canSeeDashboard || canSeeReceivables) && (
          <Button asChild variant="ghost" size="sm">
            <Link to={canSeeDashboard ? "/finance-dashboard" : "/reports?range=bulan-ini"}>
              {canSeeDashboard ? "Dasbor keuangan" : "Lihat laporan"} <ArrowRight className="h-3.5 w-3.5" />
            </Link>
          </Button>
        )}
      />
      <div className="grid divide-y divide-line md:auto-cols-fr md:grid-flow-col md:divide-x md:divide-y-0">
        {canSeeReports && <FinanceFigure label="Kas & bank" query={bank} tone="pine" to="/laporan/bank_summary"
          hint="Saldo seluruh rekening kas dan bank hari ini, dari buku besar." />}
        {canSeeReports && <FinanceFigure label="Piutang lewat jatuh tempo" query={overdueReceivables} tone="signal" to="/laporan/ar_aging"
          hint="Tagihan yang sudah lewat jatuh tempo dan belum dibayar." />}
        {canSeeReports && <FinanceFigure label="Hutang jatuh tempo 7 hari" query={payablesDue} tone="signal" to="/laporan/ap_aging"
          hint="Tagihan vendor yang jatuh tempo dalam seminggu, termasuk yang sudah lewat." />}
        {canSeeCash && <FinanceFigure label="Kas terverifikasi" query={cash} tone="pine"
          hint="Pembayaran terverifikasi bulan ini, bukan pendapatan akrual." />}
        {canSeeReceivables && <FinanceFigure label="Piutang bulan berjalan" query={receivables} tone="signal"
          hint="Sisa tagihan yang diterbitkan bulan ini, bukan seluruh piutang." />}
        {canSeeMargin && <FinanceFigure label="Margin kotor" query={margin} tone="pine"
          hint="Pendapatan akrual dikurangi harga pokok penjualan bulan ini." />}
      </div>
    </Panel>
  );
}

function FinanceFigure({ label, hint, query, tone, to }: {
  label: string; hint: string; query: UseQueryResult<FinanceTotal, Error>; tone: "pine" | "signal"; to?: string;
}) {
  const incomplete = query.data?.complete === false;
  const body = (
    <div className={cn("min-w-0 p-5", to && "transition-colors hover:bg-panel-sunk")}>
      <div className={cn("border-l-2 pl-4", tone === "pine" ? "border-pine" : "border-signal")}>
        <h3 className="label text-2xs text-ink-muted">{label}</h3>
        {query.isPending ? <Skeleton className="my-2 h-9 w-40" /> : query.isError || incomplete ? (
          <div role="status" className="mt-2">
            <p className="text-sm font-medium text-ink">{incomplete ? "Data belum lengkap" : "Tidak tersedia"}</p>
            <p className="mt-1 text-xs text-ink-muted">{incomplete ? "Jumlah data melebihi batas ringkasan. Total tidak ditampilkan." : "Gagal memuat ringkasan keuangan."}</p>
            {query.isError && <Button variant="outline" size="sm" className="mt-2" onClick={() => void query.refetch()}>Coba lagi</Button>}
          </div>
        ) : query.data.complete ? (
          <p className="data mt-2 text-3xl font-semibold tracking-tight text-ink" title={formatRupiah(query.data.amount)}>
            {formatRupiahShort(query.data.amount)}
          </p>
        ) : null}
        <p className="mt-3 text-xs leading-relaxed text-ink-muted">{hint}</p>
      </div>
    </div>
  );
  return to ? <Link to={to} className="block">{body}</Link> : body;
}
