import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Pencil, Plus, Store, Trash2 } from "lucide-react";
import {
  exportOutlet,
  getKecamatanOptions,
  getOutletList,
  removeOutlet,
  type OutletView,
} from "@/features/outlet/api/outletApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Meter } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Field, SearchInput, SelectInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatNumber, formatPercentId, formatRupiahShort } from "@/lib/format";
import type { OutletStatus } from "@/types/domain";
import { outletLabel, outletLabelTitle } from "@/lib/lexicon";

const STATUSES: (OutletStatus | "Semua")[] = [
  "Semua",
  "Aktif",
  "Nonaktif",
  "Ditangguhkan",
];

export function OutletListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<OutletStatus | "Semua">("Semua");
  const [kecamatan, setKecamatan] = useState("Semua");
  const [pendingDelete, setPendingDelete] = useState<OutletView | null>(null);

  const list = useQuery({
    queryKey: [...scopeKey(), "outlet-list", search, status, kecamatan],
    queryFn: () => getOutletList({ search, status, kecamatan }),
  });
  const kecamatanOptions = useQuery({
    queryKey: [...scopeKey(), "kecamatan-options"],
    queryFn: getKecamatanOptions,
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => removeOutlet(id),
    errorTitle: `Hapus ${outletLabel()} gagal`,
    success: `${outletLabelTitle()} dihapus`,
    onDone: () => setPendingDelete(null),
  });

  const exportMutation = useDeskMutation({
    mutationFn: () => exportOutlet(),
    errorTitle: "Unduh gagal",
    success: (count) => ({
      title: "Berkas CSV diunduh",
      description: `${count} ${outletLabel()} diekspor.`,
    }),
  });

  const rows = list.data ?? [];
  const aktif = rows.filter((p) => p.status === "Aktif").length;
  // Outlets with an unverified invoice. The header clause below already hides
  // itself when this is empty, which is what the API build produces -- invoices
  // are not readable there, so the count is zero and nothing claims otherwise.
  const tertunggak = rows.filter((p) => p.tagihanTertunda > 0);

  const columns: Column<OutletView>[] = [
    {
      key: "nama",
      header: outletLabelTitle(),
      render: (row) => (
        <>
          <Link
            to={`/outlet/${row.id}`}
            className="block font-medium text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
          >
            {row.nama}
          </Link>
          <span className="data block text-2xs text-ink-muted">{row.kode}</span>
        </>
      ),
      sortValue: (row) => row.nama,
    },
    {
      key: "wilayah",
      header: "Wilayah",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">Kec. {row.kecamatan}</span>
          <span className="block text-2xs text-ink-muted">{row.kota}</span>
        </>
      ),
      sortValue: (row) => row.kecamatan,
    },
    {
      key: "pj",
      header: "Penanggung jawab",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">{row.penanggungJawab || "—"}</span>
          <span className="data block text-2xs text-ink-muted">{row.telepon}</span>
        </>
      ),
      sortValue: (row) => row.penanggungJawab,
    },
    {
      key: "kuota",
      header: "Kuota bulan ini",
      width: "14rem",
      render: (row) => {
        const pct =
          row.kuotaBulanan === 0 ? 0 : (row.terpakaiBulanIni / row.kuotaBulanan) * 100;
        // No deliveries, no realisation -- so the column shows the obligation
        // rather than a meter pinned at zero, which would read as "this outlet
        // has taken none of its quota" when the truth is that nobody here can
        // see what it has taken.
        if (!row.statistikTersedia) {
          return (
            <span className="data text-ink">
              {formatNumber(row.kuotaBulanan)}
              <span className="text-ink-muted"> direncanakan</span>
            </span>
          );
        }
        return (
          <div className="min-w-[9rem]">
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="data text-ink">
                {formatNumber(row.terpakaiBulanIni)}
                <span className="text-ink-muted"> / {formatNumber(row.kuotaBulanan)}</span>
              </span>
              <span className="data text-ink-muted">{formatPercentId(pct)}</span>
            </div>
            <Meter
              value={row.terpakaiBulanIni}
              max={row.kuotaBulanan}
              tone={pct >= 95 ? "rust" : pct >= 70 ? "signal" : "pine"}
              label={`Kuota ${row.nama}`}
            />
          </div>
        );
      },
      sortValue: (row) =>
        row.kuotaBulanan === 0 ? 0 : row.terpakaiBulanIni / row.kuotaBulanan,
    },
    {
      key: "tagihan",
      header: "Tagihan tertunda",
      align: "right",
      render: (row) =>
        row.tagihanTertunda === 0 ? (
          <span className="text-xs text-ink-muted">—</span>
        ) : (
          <>
            <span className="data block font-semibold text-signal-ink">
              {formatNumber(row.tagihanTertunda)}
            </span>
            <span className="data block text-2xs text-ink-muted">
              {formatRupiahShort(row.nilaiTertunda)}
            </span>
          </>
        ),
      sortValue: (row) => row.nilaiTertunda,
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      render: (row) => (
        <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Ubah ${row.nama}`}
            onClick={() => navigate(`/outlet/${row.id}/edit`)}
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Hapus ${row.nama}`}
            onClick={() => setPendingDelete(row)}
            className="hover:bg-rust-soft hover:text-rust-ink"
          >
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data induk"
        title={outletLabelTitle()}
        description={`${outletLabelTitle()} yang dilayani agen, beserta kuota bulanan dan tagihan yang masih terbuka.`}
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate(undefined as never)}
              disabled={exportMutation.isPending}
            >
              <Download className="h-3.5 w-3.5" />
              Unduh CSV
            </Button>
            <Button asChild>
              <Link to="/outlet/new">
                <Plus className="h-3.5 w-3.5" />
                Daftarkan {outletLabel()}
              </Link>
            </Button>
          </>
        }
        meta={
          <span className="text-xs text-ink-muted">
            <span className="data">{aktif}</span> aktif dari{" "}
            <span className="data">{rows.length}</span> terdaftar
            {tertunggak.length > 0 && (
              <>
                {" · "}
                <span className="text-signal-ink">
                  <span className="data">{tertunggak.length}</span> punya tagihan
                  tertunda
                </span>
              </>
            )}
          </span>
        }
      />

      <div className="grid grid-cols-1 gap-3 rounded-md border border-line bg-panel p-4 sm:grid-cols-3">
        <Field label="Cari">
          <SearchInput
            value={search}
            onChange={setSearch}
            placeholder="Nama, kode, atau penanggung jawab"
          />
        </Field>
        <Field label="Status">
          <SelectInput
            value={status}
            onChange={(e) => setStatus(e.target.value as OutletStatus | "Semua")}
          >
            {STATUSES.map((s) => (
              <option key={s} value={s}>
                {s}
              </option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Kecamatan">
          <SelectInput value={kecamatan} onChange={(e) => setKecamatan(e.target.value)}>
            <option value="Semua">Semua kecamatan</option>
            {(kecamatanOptions.data ?? []).map((k) => (
              <option key={k} value={k}>
                {k}
              </option>
            ))}
          </SelectInput>
        </Field>
      </div>

      <Panel>
        <PanelHeader title={`Daftar ${outletLabel()}`} hint={`${rows.length} baris`} />
        <DataTable
          columns={columns}
          data={rows}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => spineFor(row.status)}
          pageSize={12}
          defaultSortKey="nama"
          emptyIcon={Store}
          emptyMessage={`Tidak ada ${outletLabel()} yang cocok`}
          emptyDescription={`Ubah filter, atau daftarkan ${outletLabel()} baru untuk mulai melayaninya.`}
          emptyAction={
            <Button asChild size="sm">
              <Link to="/outlet/new">Daftarkan {outletLabel()}</Link>
            </Button>
          }
          dense
        />
      </Panel>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.nama}?`}
        message={`${outletLabelTitle()} hilang dari daftar dan tidak dapat dipilih pada rencana distribusi berikutnya.`}
        details={
          pendingDelete && (
            <p className={cn(pendingDelete.tagihanTertunda > 0 && "text-rust-ink")}>
              {pendingDelete.tagihanTertunda > 0
                ? `Masih ada ${pendingDelete.tagihanTertunda} tagihan senilai ${formatRupiahShort(pendingDelete.nilaiTertunda)} yang belum diverifikasi. Riwayat pengiriman tetap tersimpan.`
                : "Riwayat pengiriman dan pembayaran tetap tersimpan untuk keperluan laporan."}
            </p>
          )
        }
        confirmLabel={`Hapus ${outletLabel()}`}
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
