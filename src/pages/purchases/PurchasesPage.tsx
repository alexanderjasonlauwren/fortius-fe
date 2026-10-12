import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Plus, ShoppingCart } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import { getPurchases, type PurchaseView } from "@/features/purchases/api/purchaseApi";
import type { PurchasePaymentStatus } from "@/features/purchases/api/contract";
import { RecordPurchaseDialog } from "@/features/purchases/components/RecordPurchaseDialog";
import { PayPurchaseDialog } from "@/features/purchases/components/PayPurchaseDialog";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Field, SelectInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateId, formatRupiah } from "@/lib/format";

const STATUS_LABEL: Record<PurchasePaymentStatus, string> = { unpaid: "Belum dibayar", paid: "Lunas" };

export function PurchasesPage() {
  const [status, setStatus] = useState<PurchasePaymentStatus | "Semua">("Semua");
  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState<PurchaseView | null>(null);

  const list = useQuery({
    queryKey: [...scopeKey(), "purchases", status],
    queryFn: () => getPurchases({ paymentStatus: status }),
  });

  const rows = list.data ?? [];
  const columns: Column<PurchaseView>[] = [
    {
      key: "number",
      header: "Nomor",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.purchaseNumber}</span>
          <span className="text-2xs text-ink-muted">
            {row.scheduleAgreementId ? "Schedule Agreement" : (row.supplierName ?? "—")}
          </span>
        </>
      ),
      sortValue: (row) => row.purchaseNumber,
    },
    {
      key: "date",
      header: "Tanggal",
      render: (row) => <span className="data text-xs">{formatDateId(row.redeemedAt)}</span>,
      sortValue: (row) => row.redeemedAt,
    },
    {
      key: "qty",
      header: "Qty",
      align: "right",
      render: (row) => <span className="data text-xs">{row.totalQty}</span>,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => <span className="data block font-medium">{formatRupiah(row.totalAmount)}</span>,
      sortValue: (row) => row.totalAmount,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <StatusBadge
          label={STATUS_LABEL[row.paymentStatus]}
          variant={row.paymentStatus === "paid" ? "success" : "warning"}
        />
      ),
    },
    {
      key: "actions",
      header: "",
      align: "right",
      render: (row) =>
        row.paymentStatus === "unpaid" ? (
          <CanAccess permission={PERMISSIONS.PURCHASES_VERIFY}>
            <Button variant="outline" size="sm" onClick={() => setPaying(row)}>
              <CircleDollarSign className="h-3.5 w-3.5" />
              Bayar
            </Button>
          </CanAccess>
        ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Pembelian"
        description="Pembelian umum dari vendor lokal -- di luar penebusan Schedule Agreement."
        actions={
          <CanAccess permission={PERMISSIONS.PURCHASES_CREATE}>
            <Button onClick={() => setRecording(true)}>
              <Plus className="h-3.5 w-3.5" />
              Pembelian baru
            </Button>
          </CanAccess>
        }
        meta={<span className="text-xs text-ink-muted"><span className="data">{rows.length}</span> catatan</span>}
      />

      <Panel>
        <PanelHeader
          title="Daftar pembelian"
          hint={`${rows.length} baris`}
          actions={
            <Field label="" htmlFor="pur-status-filter" className="mb-0">
              <SelectInput
                id="pur-status-filter"
                value={status}
                onChange={(e) => setStatus(e.target.value as PurchasePaymentStatus | "Semua")}
              >
                <option value="Semua">Semua status</option>
                {Object.entries(STATUS_LABEL).map(([value, label]) => (
                  <option key={value} value={value}>{label}</option>
                ))}
              </SelectInput>
            </Field>
          }
        />
        <DataTable
          columns={columns}
          data={rows}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => (row.paymentStatus === "paid" ? "text-pine" : "text-draft")}
          pageSize={12}
          defaultSortKey="date"
          defaultSortDir="desc"
          dense
          emptyIcon={ShoppingCart}
          emptyMessage="Belum ada pembelian"
          emptyDescription="Catat pembelian umum dari vendor lokal, di luar Schedule Agreement."
        />
      </Panel>

      <RecordPurchaseDialog open={recording} onClose={() => setRecording(false)} onSaved={() => list.refetch()} />
      <PayPurchaseDialog purchase={paying} onClose={() => setPaying(null)} onPaid={() => list.refetch()} />
    </div>
  );
}
