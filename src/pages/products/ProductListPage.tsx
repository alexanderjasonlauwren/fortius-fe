import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Fuel, Pencil, Plus, Trash2 } from "lucide-react";
import {
  changeStock,
  exportProducts,
  getProducts,
  getStockSummary,
  removeProduct,
  type ProductView,
} from "@/features/products/api/productApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader, Meter } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, SearchInput, SegmentedControl, TextInput } from "@/components/common/Field";
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
import { formatNumber, formatPercentId, formatRupiah, formatRupiahShort } from "@/lib/format";
import { supplierLabel, unitLabel } from "@/lib/lexicon";

type Filter = "Semua" | "Aktif" | "Stok rendah";

export function ProductListPage() {
  const navigate = useNavigate();
  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState<Filter>("Semua");
  const [pendingDelete, setPendingDelete] = useState<ProductView | null>(null);
  const [adjusting, setAdjusting] = useState<ProductView | null>(null);
  const [delta, setDelta] = useState(0);
  const [alasan, setAlasan] = useState("");

  const list = useQuery({
    queryKey: [...scopeKey(), "products", search, filter],
    queryFn: () =>
      getProducts({
        search,
        onlyLowStock: filter === "Stok rendah",
        onlyActive: filter === "Aktif",
      }),
  });
  const summary = useQuery({ queryKey: [...scopeKey(), "stock-summary"], queryFn: getStockSummary });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => removeProduct(id),
    errorTitle: "Hapus produk gagal",
    success: "Produk dihapus",
    onDone: () => setPendingDelete(null),
  });

  const stockMutation = useDeskMutation({
    mutationFn: ({ id, amount, reason }: { id: string; amount: number; reason: string }) =>
      changeStock(id, amount, reason),
    errorTitle: "Penyesuaian stok gagal",
    success: (p) => ({
      title: `Stok ${p.nama} kini ${formatNumber(p.stok)}`,
      description: p.stokRendah ? "Masih di bawah stok minimum." : undefined,
      tone: p.stokRendah ? "warning" : "success",
    }),
    onDone: () => {
      setAdjusting(null);
      setDelta(0);
      setAlasan("");
    },
  });

  const exportMutation = useDeskMutation({
    mutationFn: () => exportProducts(),
    errorTitle: "Unduh gagal",
    success: (count) => ({
      title: "Berkas CSV diunduh",
      description: `${count} produk diekspor.`,
    }),
  });

  const rows = list.data ?? [];

  const columns: Column<ProductView>[] = [
    {
      key: "nama",
      header: "Produk",
      render: (row) => (
        <>
          <span className="block font-medium text-ink">{row.nama}</span>
          <span className="data block text-2xs text-ink-muted">
            {row.kode} · {row.ukuran}
          </span>
        </>
      ),
      sortValue: (row) => row.nama,
    },
    {
      key: "harga",
      header: "Harga jual",
      align: "right",
      render: (row) => (
        <>
          <span className="data block text-ink">{formatRupiah(row.hargaJual)}</span>
          {row.hargaBeli > 0 && (
            <span className="data block text-2xs text-ink-muted">
              beli {formatRupiah(row.hargaBeli)}
            </span>
          )}
        </>
      ),
      sortValue: (row) => row.hargaJual,
    },
    {
      key: "margin",
      header: "Margin",
      align: "right",
      // Gated on hargaBeli, not stokTersedia: cost/sell pricing has its own
      // write path on the real API now and is independent of stock, which
      // still has none (core.stock_levels serves nothing yet). The two used
      // to be unavailable together, which is the only reason sharing one
      // flag ever looked correct.
      render: (row) =>
        row.hargaBeli > 0 ? (
          <>
            <span className="data block text-ink">{formatRupiah(row.margin)}</span>
            <span className="data block text-2xs text-ink-muted">
              {formatPercentId(row.marginPersen, 1)}
            </span>
          </>
        ) : (
          <span className="text-2xs text-ink-muted">Harga beli belum tersedia</span>
        ),
      sortValue: (row) => row.marginPersen,
    },
    {
      key: "stok",
      header: "Stok gudang",
      width: "14rem",
      render: (row) =>
        row.stokTersedia ? (
          <div className="min-w-[9rem]">
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="data text-ink">{formatNumber(row.stok)}</span>
              <span className="data text-ink-muted">
                min {formatNumber(row.stokMinimum)}
              </span>
            </div>
            <Meter
              value={row.stok}
              max={Math.max(row.stokMinimum * 2, row.stok, 1)}
              tone={row.stokRendah ? "rust" : "pine"}
              label={`Stok ${row.nama}`}
            />
          </div>
        ) : (
          <span className="text-2xs text-ink-muted">
            Belum tersedia dari API — min {formatNumber(row.stokMinimum)}
          </span>
        ),
      sortValue: (row) => row.stok,
    },
    {
      key: "status",
      header: "Status",
      width: "9rem",
      render: (row) =>
        !row.aktif ? (
          <StatusBadge variant="draft" label="Nonaktif" />
        ) : row.stokTersedia && row.stokRendah ? (
          <StatusBadge variant="danger" label="Stok rendah" />
        ) : (
          <StatusBadge variant="success" label="Tersedia" />
        ),
      sortValue: (row) => (row.aktif ? (row.stokTersedia && row.stokRendah ? 1 : 0) : 2),
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {row.stokTersedia && (
            <Button
              variant="outline"
              size="xs"
              onClick={() => {
                setDelta(0);
                setAlasan("");
                setAdjusting(row);
              }}
            >
              Sesuaikan stok
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Ubah ${row.nama}`}
            onClick={() => navigate(`/products/${row.id}/edit`)}
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

  const s = summary.data;

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data induk"
        title="Produk"
        description={`Katalog ${unitLabel()} dan perlengkapan, harga jual, serta stok yang tersimpan di gudang agen.`}
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
              <Link to="/products/new">
                <Plus className="h-3.5 w-3.5" />
                Tambah produk
              </Link>
            </Button>
          </>
        }
      />

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
        <Stat label="Produk terdaftar" value={formatNumber(s?.total ?? 0)} />
        <Stat label="Aktif dijual" value={formatNumber(s?.aktif ?? 0)} tone="pine" />
        {s?.stokTersedia !== false && (
          <>
            <Stat
              label="Di bawah stok minimum"
              value={formatNumber(s?.stokRendah ?? 0)}
              tone={s && s.stokRendah > 0 ? "rust" : undefined}
            />
            <Stat
              label="Nilai stok"
              value={formatRupiahShort(s?.nilaiStok ?? 0)}
              hint="Dihitung dari harga beli"
            />
          </>
        )}
      </div>

      <Panel>
        <PanelHeader
          title="Katalog"
          hint={`${rows.length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Nama atau kode SKU"
                className="w-52"
              />
              <SegmentedControl
                value={filter}
                onChange={setFilter}
                options={[
                  { value: "Semua" as const, label: "Semua" },
                  { value: "Aktif" as const, label: "Aktif" },
                ]}
              />
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={rows}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) =>
            !row.aktif ? "text-draft" : row.stokRendah ? "text-rust" : "text-pine"
          }
          pageSize={12}
          defaultSortKey="nama"
          emptyIcon={Fuel}
          emptyMessage="Tidak ada produk yang cocok"
          emptyDescription="Ubah filter, atau tambahkan produk baru ke katalog."
          emptyAction={
            <Button asChild size="sm">
              <Link to="/products/new">Tambah produk</Link>
            </Button>
          }
          dense
        />
      </Panel>

      {/* Stock adjustment */}
      <Dialog open={!!adjusting} onOpenChange={(open) => !open && setAdjusting(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Sesuaikan stok {adjusting?.nama}</DialogTitle>
            <DialogDescription>
              Gunakan angka positif untuk barang masuk dan negatif untuk barang
              keluar. Setiap penyesuaian tercatat pada jejak aktivitas.
            </DialogDescription>
          </DialogHeader>

          <div className="rounded-md border border-line bg-panel-sunk px-4 py-3 text-xs text-ink-muted">
            Stok saat ini{" "}
            <span className="data font-semibold text-ink">
              {formatNumber(adjusting?.stok ?? 0)}
            </span>
            {delta !== 0 && (
              <>
                {" → "}
                <span
                  className={cn(
                    "data font-semibold",
                    (adjusting?.stok ?? 0) + delta < (adjusting?.stokMinimum ?? 0)
                      ? "text-rust-ink"
                      : "text-ink",
                  )}
                >
                  {formatNumber((adjusting?.stok ?? 0) + delta)}
                </span>
              </>
            )}
          </div>

          <div className="space-y-4">
            <Field label="Jumlah penyesuaian" htmlFor="delta" required>
              <TextInput
                id="delta"
                type="number"
                mono
                value={delta}
                onChange={(e) => setDelta(Number(e.target.value))}
              />
            </Field>
            <Field label="Alasan" htmlFor="alasan" required>
              <TextInput
                id="alasan"
                value={alasan}
                placeholder={`Contoh: penerimaan dari ${supplierLabel()}`}
                onChange={(e) => setAlasan(e.target.value)}
              />
            </Field>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setAdjusting(null)}>
              Batal
            </Button>
            <Button
              disabled={delta === 0 || !alasan.trim() || stockMutation.isPending}
              onClick={() =>
                adjusting &&
                stockMutation.mutate({ id: adjusting.id, amount: delta, reason: alasan })
              }
            >
              Simpan penyesuaian
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.nama}?`}
        message="Produk hilang dari katalog dan tidak dapat dipilih lagi."
        details="Riwayat penjualan pada laporan periode sebelumnya tidak terpengaruh."
        confirmLabel="Hapus produk"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}

function Stat({
  label,
  value,
  hint,
  tone,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: "pine" | "rust";
}) {
  const spine = { pine: "spine text-pine", rust: "spine text-rust" };
  return (
    <div className={cn("rounded-md border border-line bg-panel p-4", tone && spine[tone])}>
      <p className="label text-2xs text-ink-muted">{label}</p>
      <p className="data mt-1.5 truncate text-figure font-semibold text-ink">{value}</p>
      {hint && <p className="mt-2 text-xs text-ink-muted">{hint}</p>}
    </div>
  );
}
