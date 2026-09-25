import { scopeKey, visibleBranches } from "@/mocks/scope";
import { Link, useNavigate, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, BarChart3, Download, Printer } from "lucide-react";
import { getRecap } from "@/features/transportation/api/transportationApi";
import type { RecapRow } from "@/features/transportation/api/contract";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Skeleton } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";
import { exportExcel, printDocument } from "@/lib/export";

function monthLabel(month: string): string {
  const d = new Date(`${month}-01`);
  if (Number.isNaN(d.getTime())) return month;
  return d.toLocaleDateString("id-ID", { month: "long", year: "numeric" });
}

function thisMonth(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

function sixMonthsAgo(): string {
  const now = new Date();
  const d = new Date(now.getFullYear(), now.getMonth() - 5, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

const columns: Column<RecapRow>[] = [
  {
    key: "bulan",
    header: "Bulan",
    render: (row) => <span className="text-xs text-ink">{monthLabel(row.month)}</span>,
    sortValue: (row) => row.month,
  },
  {
    key: "klaim",
    header: "Jumlah klaim",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{row.claimCount}</span>,
  },
  {
    key: "qty",
    header: "Tabung",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{row.totalQty.toLocaleString("id-ID")}</span>,
  },
  {
    key: "kg",
    header: "Kilogram",
    align: "right",
    render: (row) => <span className="data text-xs text-ink">{row.totalWeightKg.toLocaleString("id-ID")}</span>,
  },
  {
    key: "claimed",
    header: "Nilai klaim",
    align: "right",
    render: (row) => <span className="data text-xs font-semibold text-ink">{formatRupiah(row.claimedAmount)}</span>,
  },
  {
    key: "paid",
    header: "Sudah lunas",
    align: "right",
    render: (row) => <span className="data text-xs text-pine-ink">{formatRupiah(row.paidAmount)}</span>,
  },
  {
    key: "outstanding",
    header: "Belum lunas",
    align: "right",
    render: (row) => <span className="data text-xs text-rust-ink">{formatRupiah(row.outstandingAmount)}</span>,
  },
  {
    key: "avgDays",
    header: "Rata-rata hari lunas",
    align: "right",
    render: (row) => (
      <span className="data text-xs text-ink-muted">
        {row.avgDaysToSettle != null ? `${row.avgDaysToSettle.toFixed(1)} hari` : "—"}
      </span>
    ),
  },
];

/**
 * Month-by-month rollup of the transportation fee -- claimed, paid, and
 * still outstanding, for one branch. D3 A-Step 7's own recap endpoint: the
 * per-month figures come straight from the backend's own aggregate, not
 * re-derived client-side, so this page cannot disagree with the claims list
 * it summarizes.
 */
export function TransportationRecapPage() {
  const navigate = useNavigate();
  const [searchParams, setSearchParams] = useSearchParams();
  const from = searchParams.get("from") || sixMonthsAgo();
  const to = searchParams.get("to") || thisMonth();
  const branchId = searchParams.get("branch") || "";

  const setParam = (key: string, value: string) =>
    setSearchParams(
      (previous) => {
        const next = new URLSearchParams(previous);
        if (value) next.set(key, value);
        else next.delete(key);
        return next;
      },
      { replace: true },
    );

  const branches = visibleBranches();

  const recap = useQuery({
    queryKey: [...scopeKey(), "transportation-recap", from, to, branchId],
    queryFn: () => getRecap({ from, to, branchId: branchId || undefined }),
  });

  const rows = recap.data?.rows ?? [];
  const totals = recap.data?.totals;

  const footer = totals ? (
    <tr>
      <td className="px-3 py-2 text-xs font-semibold text-ink">Total</td>
      <td className="px-3 py-2 text-right text-xs font-semibold text-ink">{totals.claimCount}</td>
      <td className="px-3 py-2 text-right text-xs font-semibold text-ink">
        {totals.totalQty.toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-2 text-right text-xs font-semibold text-ink">
        {totals.totalWeightKg.toLocaleString("id-ID")}
      </td>
      <td className="px-3 py-2 text-right text-xs font-semibold text-ink">
        {formatRupiah(totals.claimedAmount)}
      </td>
      <td className="px-3 py-2 text-right text-xs font-semibold text-pine-ink">
        {formatRupiah(totals.paidAmount)}
      </td>
      <td className="px-3 py-2 text-right text-xs font-semibold text-rust-ink">
        {formatRupiah(totals.outstandingAmount)}
      </td>
      <td />
    </tr>
  ) : undefined;

  const branchName = branches.find((b) => b.id === branchId)?.nama ?? "Semua cabang";

  const exportRows = () =>
    exportExcel(
      `rekap-transport-fee-${from}-${to}`,
      "Rekap",
      [
        { header: "Bulan", value: (r: RecapRow) => monthLabel(r.month), width: 16 },
        { header: "Jumlah Klaim", value: (r: RecapRow) => r.claimCount, type: "number", width: 12 },
        { header: "Tabung", value: (r: RecapRow) => r.totalQty, type: "number", width: 12 },
        { header: "Kilogram", value: (r: RecapRow) => r.totalWeightKg, type: "number", width: 12 },
        { header: "Nilai Klaim", value: (r: RecapRow) => r.claimedAmount, type: "currency", width: 16 },
        { header: "Sudah Lunas", value: (r: RecapRow) => r.paidAmount, type: "currency", width: 16 },
        { header: "Belum Lunas", value: (r: RecapRow) => r.outstandingAmount, type: "currency", width: 16 },
      ],
      rows,
    );

  const printRecap = () => {
    if (!totals) return;
    printDocument(
      `Rekap Transport Fee ${from} – ${to}`,
      `
      <p class="eyebrow">${branchName}</p>
      <h1>Rekapitulasi Bulanan Biaya Transportasi</h1>
      <p>Periode ${monthLabel(from)} – ${monthLabel(to)}</p>
      <hr class="rule" />
      <table>
        <thead>
          <tr>
            <th>Bulan</th><th style="text-align:right">Klaim</th><th style="text-align:right">Tabung</th>
            <th style="text-align:right">Kg</th><th style="text-align:right">Nilai Klaim</th>
            <th style="text-align:right">Lunas</th><th style="text-align:right">Belum Lunas</th>
          </tr>
        </thead>
        <tbody>
          ${rows
            .map(
              (r) => `<tr>
                <td>${monthLabel(r.month)}</td><td class="num">${r.claimCount}</td>
                <td class="num">${r.totalQty.toLocaleString("id-ID")}</td>
                <td class="num">${r.totalWeightKg.toLocaleString("id-ID")}</td>
                <td class="num">${formatRupiah(r.claimedAmount)}</td>
                <td class="num">${formatRupiah(r.paidAmount)}</td>
                <td class="num">${formatRupiah(r.outstandingAmount)}</td>
              </tr>`,
            )
            .join("")}
        </tbody>
        <tfoot>
          <tr>
            <td>Total</td><td class="num">${totals.claimCount}</td>
            <td class="num">${totals.totalQty.toLocaleString("id-ID")}</td>
            <td class="num">${totals.totalWeightKg.toLocaleString("id-ID")}</td>
            <td class="num">${formatRupiah(totals.claimedAmount)}</td>
            <td class="num">${formatRupiah(totals.paidAmount)}</td>
            <td class="num">${formatRupiah(totals.outstandingAmount)}</td>
          </tr>
        </tfoot>
      </table>`,
    );
  };

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali
      </Button>

      <PageHeader
        eyebrow="Klaim Transportasi"
        title="Rekap Bulanan"
        description="Nilai klaim, yang sudah lunas, dan yang masih tertagih ke prinsipal, per bulan."
        actions={
          <div className="flex gap-2">
            <Button variant="outline" onClick={printRecap} disabled={!totals}>
              <Printer className="h-3.5 w-3.5" />
              Cetak
            </Button>
            <Button variant="outline" onClick={exportRows} disabled={rows.length === 0}>
              <Download className="h-3.5 w-3.5" />
              Unduh Excel
            </Button>
          </div>
        }
      />

      <Panel>
        <PanelHeader
          title="Filter"
          actions={
            <div className="flex flex-wrap items-end gap-3">
              <Field label="Dari" htmlFor="recap-from">
                <TextInput
                  id="recap-from"
                  type="month"
                  value={from}
                  max={to}
                  onChange={(e) => setParam("from", e.target.value)}
                />
              </Field>
              <Field label="Sampai" htmlFor="recap-to">
                <TextInput
                  id="recap-to"
                  type="month"
                  value={to}
                  min={from}
                  onChange={(e) => setParam("to", e.target.value)}
                />
              </Field>
              <Field label="Cabang" htmlFor="recap-branch">
                <SelectInput
                  id="recap-branch"
                  value={branchId}
                  onChange={(e) => setParam("branch", e.target.value)}
                >
                  <option value="">Semua cabang</option>
                  {branches.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.nama}
                    </option>
                  ))}
                </SelectInput>
              </Field>
            </div>
          }
        />
        {recap.isLoading ? (
          <div className="p-4">
            <Skeleton className="h-48 w-full" />
          </div>
        ) : (
          <DataTable
            columns={columns}
            data={rows}
            isLoading={false}
            rowKey={(row) => row.month}
            footer={footer}
            emptyIcon={BarChart3}
            emptyMessage="Tidak ada klaim pada periode ini"
            dense
          />
        )}
      </Panel>

      {rows.length > 0 && (
        <p className="text-xs text-ink-muted">
          <Link to="/transportation-claims" className="underline underline-offset-2">
            Lihat daftar klaim
          </Link>{" "}
          untuk rincian per klaim.
        </p>
      )}
    </div>
  );
}
