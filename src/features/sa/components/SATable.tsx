import { CheckCircle2, FileText, Printer, Trash2, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { DataTable, type Column } from "@/components/common/DataTable";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Meter } from "@/components/common/Panel";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatNumber, formatPercentId } from "@/lib/format";
import type { ScheduleAgreement } from "../types";

interface SATableProps {
  data: ScheduleAgreement[];
  isLoading: boolean;
  onActivate: (id: string) => void;
  onPrint: (id: string) => void;
  onDelete: (sa: ScheduleAgreement) => void;
  /**
   * Absent when the signed-in user may not import.
   *
   * A prop rather than a permission check inside the table: the table renders
   * what it is given, and the page already knows who is looking.
   */
  onImport?: (sa: ScheduleAgreement) => void;
  pendingId?: string;
}

export function SATable({
  data,
  isLoading,
  onActivate,
  onPrint,
  onDelete,
  onImport,
  pendingId,
}: SATableProps) {
  const columns: Column<ScheduleAgreement>[] = [
    {
      key: "nomorSA",
      header: "Nomor SA",
      width: "13rem",
      render: (row) => (
        <>
          <Link
            to={`/sa/${row.id}`}
            className="data block whitespace-nowrap text-xs font-semibold text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
          >
            {row.nomorSA}
          </Link>
          <span className="block text-xs text-ink-muted">{row.supplier}</span>
        </>
      ),
      sortValue: (row) => row.nomorSA,
    },
    {
      key: "produk",
      header: "Produk",
      width: "10rem",
      render: (row) =>
        row.products.length === 0 ? (
          <span className="text-xs text-ink-muted">—</span>
        ) : (
          <span className="block text-xs text-ink">
            {row.products.map((p) => p.productName).join(", ")}
          </span>
        ),
      sortValue: (row) => row.products[0]?.productName ?? "",
    },
    {
      key: "periode",
      header: "Periode",
      width: "12rem",
      render: (row) => (
        <>
          <span className="block whitespace-nowrap text-xs text-ink">
            {formatDateId(row.periodeMulai)} – {formatDateId(row.periodeBerakhir)}
          </span>
          <span
            className={cn(
              "block text-2xs",
              row.sisaHari < 0
                ? "text-ink-muted"
                : row.sisaHari <= 7
                  ? "font-semibold text-rust-ink"
                  : "text-ink-muted",
            )}
          >
            {row.sisaHari < 0
              ? "Periode berakhir"
              : row.sisaHari === 0
                ? "Berakhir hari ini"
                : `${row.sisaHari} hari lagi`}
          </span>
        </>
      ),
      sortValue: (row) => row.periodeMulai,
    },
    {
      key: "kuota",
      header: "Penarikan kuota",
      width: "16rem",
      render: (row) => {
        const pct = row.totalKuota === 0 ? 0 : (row.sudahDidistribusikan / row.totalKuota) * 100;
        return (
          <div className="min-w-[11rem]">
            <div className="mb-1.5 flex items-baseline justify-between gap-2 text-xs">
              <span className="data text-ink">
                {formatNumber(row.sudahDidistribusikan)}
                <span className="text-ink-muted"> / {formatNumber(row.totalKuota)}</span>
              </span>
              <span className="data text-ink-muted">{formatPercentId(pct)}</span>
            </div>
            <Meter
              value={row.sudahDidistribusikan}
              max={row.totalKuota}
              tone={pct >= 95 ? "rust" : pct >= 70 ? "signal" : "pine"}
              label={`Kuota ${row.nomorSA} terpakai ${formatPercentId(pct)}`}
            />
          </div>
        );
      },
      sortValue: (row) =>
        row.totalKuota === 0 ? 0 : row.sudahDidistribusikan / row.totalKuota,
    },
    {
      key: "sisaKuota",
      header: "Sisa",
      align: "right",
      render: (row) => (
        <span className="data font-semibold text-ink">{formatNumber(row.sisaKuota)}</span>
      ),
      sortValue: (row) => row.sisaKuota,
    },
    {
      key: "rencana",
      header: "Rencana",
      align: "right",
      render: (row) => (
        <span className="data text-ink-muted">{formatNumber(row.jumlahRencana)}</span>
      ),
      sortValue: (row) => row.jumlahRencana,
    },
    {
      key: "status",
      header: "Status",
      width: "7rem",
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
          {row.status === "Draf" && (
            <Button
              size="xs"
              onClick={() => onActivate(row.id)}
              disabled={pendingId === row.id}
            >
              <CheckCircle2 className="h-3 w-3" />
              Aktifkan
            </Button>
          )}
          {/* Draft excluded: targets belong to an agreement that is in force,
              and importing a month of obligations against something nobody has
              verified yet writes a record with no authority behind it. */}
          {onImport && row.status !== "Draf" && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Impor target harian ${row.nomorSA}`}
              title="Impor target harian"
              onClick={() => onImport(row)}
            >
              <Upload className="h-3.5 w-3.5" />
            </Button>
          )}
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Cetak ringkasan ${row.nomorSA}`}
            title="Cetak ringkasan kuota"
            onClick={() => onPrint(row.id)}
          >
            <Printer className="h-3.5 w-3.5" />
          </Button>
          {row.sudahDidistribusikan === 0 && (
            <Button
              variant="ghost"
              size="icon-xs"
              aria-label={`Hapus ${row.nomorSA}`}
              title="Hapus SA"
              onClick={() => onDelete(row)}
              className="hover:bg-rust-soft hover:text-rust-ink"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          )}
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      data={data}
      isLoading={isLoading}
      rowKey={(row) => row.id}
      spineFor={(row) => spineFor(row.status)}
      pageSize={8}
      defaultSortKey="periode"
      defaultSortDir="desc"
      emptyIcon={FileText}
      emptyMessage="Tidak ada SA yang cocok"
      emptyDescription="Ubah filter, atau unggah SA baru dari panel di samping."
      dense
    />
  );
}
