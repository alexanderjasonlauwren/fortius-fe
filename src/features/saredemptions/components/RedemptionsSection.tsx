/**
 * Pembelian › Penebusan SA: every penebusan with how much of it has arrived,
 * and the button to record the next weekly PDF.
 */
import { useState } from "react";
import { Link } from "react-router-dom";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { Fuel, Plus } from "lucide-react";
import { getRedemptions, type RedemptionView } from "@/features/saredemptions/api/saRedemptionApi";
import { RecordRedemptionDialog } from "@/features/saredemptions/components/RecordRedemptionDialog";
import { AttachmentsButton } from "@/features/attachments/components/AttachmentsButton";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useResettableState } from "@/hooks/useResettableState";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { SearchInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { scopeKey } from "@/lib/scope";
import { formatDateId, formatRupiah, formatNumber } from "@/lib/format";

function arrival(row: RedemptionView): { label: string; variant: "success" | "warning" | "draft" } {
  if (row.status === "void") return { label: "Batal", variant: "draft" };
  if (row.receivedQuantity >= row.totalQuantity) return { label: "Diterima semua", variant: "success" };
  return { label: "Sebagian datang", variant: "warning" };
}

export function RedemptionsSection({ prefillSA }: { prefillSA?: string }) {
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(!!prefillSA);
  const [page, setPage] = useResettableState([search], () => 1);
  const list = useQuery({
    queryKey: [...scopeKey(), "sa-redemptions", search, page],
    queryFn: () => getRedemptions(search, page),
    placeholderData: keepPreviousData,
  });

  const columns: Column<RedemptionView>[] = [
    {
      key: "number",
      header: "Penebusan",
      render: (row) => (
        <>
          <Link to={`/purchases/penebusan/${row.id}`} className="data block text-xs text-ink underline-offset-2 hover:underline">
            {row.redemptionNumber}
          </Link>
          <span className="text-2xs text-ink-muted">SA {row.saNumber}</span>
        </>
      ),
      sortValue: (row) => row.redemptionNumber,
    },
    {
      key: "reference",
      header: "Ref. transaksi",
      render: (row) => <span className="data text-xs">{row.transactionReference}</span>,
    },
    {
      key: "paid",
      header: "Dibayar",
      render: (row) => <span className="data text-xs">{formatDateId(row.paidOn)}</span>,
      sortValue: (row) => row.paidOn,
    },
    {
      key: "qty",
      header: "Tabung",
      align: "right",
      render: (row) => (
        <span className="data block text-xs">
          {formatNumber(row.receivedQuantity)} / {formatNumber(row.totalQuantity)}
        </span>
      ),
    },
    {
      key: "total",
      header: "Total debit",
      align: "right",
      render: (row) => <span className="data block">{formatRupiah(row.totalDebit)}</span>,
      sortValue: (row) => row.totalDebit,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge {...arrival(row)} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => <AttachmentsButton ownerType="sa_redemption" ownerId={row.id} label={row.redemptionNumber} />,
    },
  ];

  return (
    <>
      <Panel>
        <PanelHeader
          title="Penebusan SA"
          hint="Dari PDF BNI Pops: bayar masuk Uang Muka, barang masuk Persediaan per tanggal kirim"
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Nomor, SA, ref. transaksi" className="w-64" />
              <CanAccess permission={PERMISSIONS.PURCHASES_CREATE}>
                <Button size="sm" onClick={() => setRecording(true)}>
                  <Plus className="h-3.5 w-3.5" /> Catat penebusan
                </Button>
              </CanAccess>
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={list.data?.items ?? []}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => (row.status === "void" ? "text-draft" : row.receivedQuantity >= row.totalQuantity ? "text-pine" : "text-draft")}
          server={list.data && { ...list.data, onPageChange: setPage }}
          dense
          emptyIcon={Fuel}
          emptyMessage="Belum ada penebusan"
          emptyDescription="Catat PDF BNI Pops tiap kali SA ditebus."
        />
      </Panel>
      <RecordRedemptionDialog open={recording} saNumber={prefillSA} onClose={() => setRecording(false)} onSaved={() => list.refetch()} />
    </>
  );
}
