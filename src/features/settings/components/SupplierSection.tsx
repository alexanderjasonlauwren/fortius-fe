import { scopeKey } from "@/lib/scope";
import { useQuery } from "@tanstack/react-query";
import { Factory } from "lucide-react";
import { getSupplierList, type SupplierView } from "@/features/system/api/systemApi";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { formatNumber } from "@/lib/format";
import { supplierLabel } from "@/lib/lexicon";

/**
 * The SA issuers (SPBE) named on Schedule Agreements. Read-only: each name is a
 * distinct `core.schedule_agreements.supplier_name`, not a row in a master
 * table, so there is nothing to add or delete here. General-purchase vendors are
 * a separate master (`core.suppliers`) managed in the Vendor section.
 */
export function SupplierSection() {
  const list = useQuery({ queryKey: [...scopeKey(), "supplier-list"], queryFn: getSupplierList });

  const columns: Column<SupplierView>[] = [
    {
      key: "nama",
      header: supplierLabel(),
      render: (row) => (
        <>
          <span className="block font-medium text-ink">{row.nama}</span>
          {row.kode && <span className="data block text-2xs text-ink-muted">{row.kode}</span>}
        </>
      ),
      sortValue: (row) => row.nama,
    },
    {
      key: "kontak",
      header: "Kontak",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">{row.penanggungJawab || "—"}</span>
          <span className="data block text-2xs text-ink-muted">{row.telepon || "—"}</span>
        </>
      ),
    },
    {
      key: "alamat",
      header: "Alamat",
      render: (row) => <span className="text-xs text-ink-muted">{row.alamat || "—"}</span>,
    },
    {
      key: "sa",
      header: "Agreement",
      align: "right",
      render: (row) => (
        <>
          <span className="data block text-ink">{formatNumber(row.jumlahSA)}</span>
          <span className="data block text-2xs text-ink-muted">
            sisa {formatNumber(row.kuotaAktif)}
          </span>
        </>
      ),
      sortValue: (row) => row.jumlahSA,
    },
    {
      key: "status",
      header: "Status",
      width: "7rem",
      render: (row) => (
        <StatusBadge variant={row.aktif ? "success" : "draft"} label={row.aktif ? "Aktif" : "Nonaktif"} />
      ),
    },
  ];

  return (
    <Panel>
      <PanelHeader
        title={`Mitra ${supplierLabel()}`}
        hint={`Nama ${supplierLabel()} berbeda yang tercatat pada Schedule Agreement. Tidak ada data induk terpisah untuk ditambah atau dihapus di sini.`}
      />
      <DataTable
        columns={columns}
        data={list.data ?? []}
        isLoading={list.isLoading}
        rowKey={(row) => row.id}
        spineFor={(row) => (row.aktif ? "text-pine" : "text-draft")}
        emptyIcon={Factory}
        emptyMessage={`Belum ada mitra ${supplierLabel()}`}
        emptyDescription={`Muncul di sini begitu ada Schedule Agreement yang menyebutkan ${supplierLabel()}.`}
        dense
      />
    </Panel>
  );
}
