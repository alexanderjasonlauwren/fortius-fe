import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, FileSpreadsheet, ReceiptText, RotateCcw } from "lucide-react";
import {
  defaultRange,
  exportTransactionsCsv,
  exportTransactionsExcel,
  getTransactionFilterOptions,
  getTransactions,
  getTransactionSummary,
  type TransactionFilters,
  type TransactionRow,
} from "@/features/transactions/api/transactionApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Field, SearchInput, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import {
  formatDateId,
  formatNumber,
  formatRupiah,
  formatRupiahShort,
} from "@/lib/format";
import { outletLabel, outletLabelTitle, unitLabel, unitLabelTitle } from "@/lib/lexicon";

const STATUS_KIRIM = ["Semua", "Antrian", "Proses", "Selesai", "Tertunda"];
// Matches TransactionRow.statusBayar's actual type, InvoiceStatus |
// "Belum ditagih" -- these used to be PaymentStatusEntity's values
// ("Menunggu Verifikasi" | "Terverifikasi" | "Ditolak"), which never equal
// an invoice's own status, so three of five options could never match a row.
const STATUS_BAYAR = [
  "Semua",
  "Belum ditagih",
  "Terbit",
  "Sebagian",
  "Lunas",
  "Jatuh Tempo",
  "Batal",
];

export function TransactionListPage() {
  const [filters, setFilters] = useState<TransactionFilters>(() => ({
    ...defaultRange(),
    search: "",
    outletId: "Semua",
    kecamatan: "Semua",
    driverId: "Semua",
    statusKirim: "Semua",
    statusBayar: "Semua",
  }));

  const rows = useQuery({
    queryKey: [...scopeKey(), "transactions", filters],
    queryFn: () => getTransactions(filters),
  });
  const summary = useQuery({
    queryKey: [...scopeKey(), "transaction-summary", filters],
    queryFn: () => getTransactionSummary(filters),
  });
  const options = useQuery({
    queryKey: [...scopeKey(), "transaction-filter-options"],
    queryFn: getTransactionFilterOptions,
  });

  const excelMutation = useDeskMutation({
    mutationFn: () => exportTransactionsExcel(filters),
    errorTitle: "Ekspor Excel gagal",
    success: (count) => ({
      title: "Berkas Excel diunduh",
      description: `${count} baris diekspor dengan filter yang sedang aktif.`,
    }),
  });

  const csvMutation = useDeskMutation({
    mutationFn: () => exportTransactionsCsv(filters),
    errorTitle: "Ekspor CSV gagal",
    success: (count) => ({
      title: "Berkas CSV diunduh",
      description: `${count} baris diekspor.`,
    }),
  });

  const patch = (next: Partial<TransactionFilters>) =>
    setFilters((f) => ({ ...f, ...next }));

  const reset = () =>
    setFilters({
      ...defaultRange(),
      search: "",
      outletId: "Semua",
      kecamatan: "Semua",
      driverId: "Semua",
      statusKirim: "Semua",
      statusBayar: "Semua",
    });

  const s = summary.data;
  const data = rows.data ?? [];

  // Read-only by design: this page is for finding and exporting, not editing.
  const columns: Column<TransactionRow>[] = [
    {
      key: "tanggal",
      header: "Tanggal",
      width: "8rem",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{formatDateId(row.tanggal)}</span>
          <span className="data block text-2xs text-ink-muted">{row.jamRencana}</span>
        </>
      ),
      sortValue: (row) => `${row.tanggal}${row.jamRencana}`,
    },
    {
      key: "dokumen",
      header: "Dokumen",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.suratJalan}</span>
          <span className="data block text-2xs text-ink-muted">{row.invoice}</span>
        </>
      ),
      sortValue: (row) => row.suratJalan,
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
          <span className="block text-2xs text-ink-muted">
            <span className="data">{row.kodeOutlet}</span> · Kec. {row.kecamatan}
          </span>
        </>
      ),
      sortValue: (row) => row.outlet,
    },
    {
      key: "armada",
      header: "Armada",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">{row.driver}</span>
          <span className="data block text-2xs text-ink-muted">{row.plat}</span>
        </>
      ),
      sortValue: (row) => row.driver,
    },
    {
      key: `${unitLabel()}`,
      header: "Realisasi",
      align: "right",
      render: (row) => {
        // Variance only means something once the drop is closed — before that a
        // shortfall is just work not done yet, not a discrepancy.
        const closed = row.statusKirim === "Selesai" || row.statusKirim === "Tertunda";
        return (
          <>
            <span className="data block text-ink">{formatNumber(row.realisasi)}</span>
            {row.target > 0 && (
              <span
                className={cn(
                  "data block text-2xs",
                  closed && row.selisih < 0 ? "text-rust-ink" : "text-ink-muted",
                )}
              >
                {!closed
                  ? `dari ${formatNumber(row.target)}`
                  : row.selisih === 0
                    ? `= ${formatNumber(row.target)}`
                    : `${row.selisih > 0 ? "+" : ""}${formatNumber(row.selisih)}`}
              </span>
            )}
          </>
        );
      },
      sortValue: (row) => row.realisasi,
    },
    {
      key: "nominal",
      header: "Nominal",
      align: "right",
      render: (row) =>
        row.nominal === 0 ? (
          <span className="text-2xs text-ink-muted">Belum ada nilai</span>
        ) : (
          <>
            <span className="data block font-semibold text-ink">
              {formatRupiah(row.nominal)}
            </span>
            <span className="block text-2xs text-ink-muted">{row.bank}</span>
          </>
        ),
      sortValue: (row) => row.nominal,
    },
    {
      key: "statusKirim",
      header: "Pengiriman",
      width: "8rem",
      render: (row) =>
        row.statusKirim === "—" ? (
          <span className="text-2xs text-ink-muted">Tanpa surat jalan</span>
        ) : (
          <StatusBadge
            variant={getStatusVariant(row.statusKirim)}
            label={row.statusKirim}
          />
        ),
      sortValue: (row) => row.statusKirim,
    },
    {
      key: "statusBayar",
      header: "Pembayaran",
      width: "11rem",
      render: (row) => (
        <>
          <StatusBadge
            variant={
              row.statusBayar === "Belum ditagih"
                ? "draft"
                : getStatusVariant(row.statusBayar)
            }
            label={row.statusBayar}
          />
          {row.diverifikasiOleh !== "—" && (
            <span className="mt-1 block text-2xs text-ink-muted">
              {row.diverifikasiOleh}
            </span>
          )}
        </>
      ),
      sortValue: (row) => row.statusBayar,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Rekap Transaksi"
        description="Seluruh baris transaksi — surat jalan beserta tagihannya, ditambah kwitansi yang masuk lewat pindaian. Saring, lalu unduh untuk diolah di Excel."
        actions={
          <CanAccess permission={PERMISSIONS.TRANSACTIONS_EXPORT}>
            <Button
              variant="outline"
              onClick={() => csvMutation.mutate(undefined as never)}
              disabled={csvMutation.isPending || data.length === 0}
            >
              <Download className="h-3.5 w-3.5" />
              CSV
            </Button>
            <Button
              onClick={() => excelMutation.mutate(undefined as never)}
              disabled={excelMutation.isPending || data.length === 0}
            >
              <FileSpreadsheet className="h-3.5 w-3.5" />
              Unduh Excel
            </Button>
          </CanAccess>
        }
      />

      {/* Summary — cards only; the charts live on Laporan. */}
      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Stat
          label="Baris transaksi"
          value={formatNumber(s?.jumlah ?? 0)}
          unit="baris"
          hint={`Dari ${formatNumber(s?.outlet ?? 0)} ${outletLabel()}`}
          isLoading={summary.isLoading}
        />
        <Stat
          label={`${unitLabelTitle()} terkirim`}
          value={formatNumber(s?.unit ?? 0)}
          unit={unitLabel()}
          hint="Realisasi pada periode terpilih"
          isLoading={summary.isLoading}
        />
        <Stat
          label="Nilai transaksi"
          value={formatRupiahShort(s?.nilai ?? 0)}
          hint={`Terverifikasi ${formatRupiahShort(s?.terverifikasi ?? 0)}`}
          isLoading={summary.isLoading}
          tone="pine"
        />
        <Stat
          label="Belum diverifikasi"
          value={formatRupiahShort((s?.menunggu ?? 0) + (s?.belumDitagih ?? 0))}
          hint={`Menunggu ${formatRupiahShort(s?.menunggu ?? 0)} · ditolak ${formatRupiahShort(s?.ditolak ?? 0)}`}
          isLoading={summary.isLoading}
          tone={s && s.menunggu + s.belumDitagih > 0 ? "signal" : undefined}
        />
      </div>

      {/* Filters */}
      <div className="rounded-md border border-line bg-panel p-4">
        <div className="mb-3 flex items-center justify-between gap-3">
          <p className="label text-2xs text-ink-muted">Saringan</p>
          <Button variant="ghost" size="xs" onClick={reset}>
            <RotateCcw className="h-3 w-3" />
            Atur ulang
          </Button>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <Field label="Dari tanggal" htmlFor="from">
            <TextInput
              id="from"
              type="date"
              mono
              value={filters.from ?? ""}
              max={filters.to}
              onChange={(e) => patch({ from: e.target.value })}
            />
          </Field>
          <Field label="Sampai tanggal" htmlFor="to">
            <TextInput
              id="to"
              type="date"
              mono
              value={filters.to ?? ""}
              min={filters.from}
              onChange={(e) => patch({ to: e.target.value })}
            />
          </Field>

          <Field label="Cari" className="sm:col-span-2">
            <SearchInput
              value={filters.search ?? ""}
              onChange={(search) => patch({ search })}
              placeholder={`Surat jalan, invoice, ${outletLabel()}, driver, atau plat`}
            />
          </Field>

          <Field label={outletLabelTitle()}>
            <SelectInput
              value={filters.outletId}
              onChange={(e) => patch({ outletId: e.target.value })}
            >
              <option value="Semua">Semua {outletLabel()}</option>
              {(options.data?.outlet ?? []).map((p) => (
                <option key={p.id} value={p.id}>
                  {p.label}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Kecamatan">
            <SelectInput
              value={filters.kecamatan}
              onChange={(e) => patch({ kecamatan: e.target.value })}
            >
              <option value="Semua">Semua kecamatan</option>
              {(options.data?.kecamatan ?? []).map((k) => (
                <option key={k} value={k}>
                  {k}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Armada">
            <SelectInput
              value={filters.driverId}
              onChange={(e) => patch({ driverId: e.target.value })}
            >
              <option value="Semua">Semua armada</option>
              {(options.data?.drivers ?? []).map((d) => (
                <option key={d.id} value={d.id}>
                  {d.label}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Status pengiriman">
            <SelectInput
              value={filters.statusKirim}
              onChange={(e) => patch({ statusKirim: e.target.value })}
            >
              {STATUS_KIRIM.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectInput>
          </Field>

          <Field label="Status pembayaran" className="sm:col-span-2 lg:col-span-1">
            <SelectInput
              value={filters.statusBayar}
              onChange={(e) => patch({ statusBayar: e.target.value })}
            >
              {STATUS_BAYAR.map((s) => (
                <option key={s} value={s}>
                  {s}
                </option>
              ))}
            </SelectInput>
          </Field>
        </div>
      </div>

      <Panel>
        <PanelHeader
          title="Daftar transaksi"
          hint={
            data.length > 0
              ? `${formatNumber(data.length)} baris · ${formatRupiah(s?.nilai ?? 0)}`
              : undefined
          }
        />
        <DataTable
          columns={columns}
          data={data}
          isLoading={rows.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) =>
            row.statusBayar === "Belum ditagih"
              ? "text-draft"
              : spineFor(row.statusBayar)
          }
          pageSize={25}
          defaultSortKey="tanggal"
          defaultSortDir="desc"
          emptyIcon={ReceiptText}
          emptyMessage="Tidak ada transaksi pada saringan ini"
          emptyDescription="Longgarkan rentang tanggal atau kosongkan sebagian filter untuk melihat lebih banyak baris."
          emptyAction={
            <Button size="sm" variant="outline" onClick={reset}>
              Atur ulang saringan
            </Button>
          }
          dense
          footer={
            <tr>
              <td className="px-4 py-3 text-xs font-semibold text-ink" colSpan={4}>
                Total {formatNumber(data.length)} baris
              </td>
              <td className="data px-4 py-3 text-right text-xs font-semibold text-ink">
                {formatNumber(s?.unit ?? 0)}
              </td>
              <td className="data px-4 py-3 text-right text-xs font-semibold text-ink">
                {formatRupiah(s?.nilai ?? 0)}
              </td>
              <td colSpan={2} />
            </tr>
          }
        />
      </Panel>
    </div>
  );
}

function Stat({
  label,
  value,
  unit,
  hint,
  tone,
  isLoading,
}: {
  label: string;
  value: string;
  unit?: string;
  hint?: string;
  tone?: "signal" | "pine";
  isLoading?: boolean;
}) {
  const spine = { signal: "spine text-signal", pine: "spine text-pine" };
  return (
    <div className={cn("rounded-md border border-line bg-panel p-4", tone && spine[tone])}>
      <p className="label text-2xs text-ink-muted">{label}</p>
      {isLoading ? (
        <div className="mt-2 h-7 w-2/3 animate-pulse rounded-sm bg-panel-raised" />
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
      {hint && <p className="mt-2 text-xs leading-relaxed text-ink-muted">{hint}</p>}
    </div>
  );
}
