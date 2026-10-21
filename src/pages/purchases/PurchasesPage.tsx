/**
 * "Pembelian": every vendor bill -- SA redemptions and general bills --
 * with what is still owed and when it falls due, and the two things done
 * daily from here: record a bill, pay one or several (accounting parity P3).
 */
import { VendorSection } from "@/features/settings/components/VendorSection";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useState } from "react";
import { Link, useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { CircleDollarSign, Layers, Plus, ShoppingCart } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import { getPurchases, type PurchaseView } from "@/features/purchases/api/purchaseApi";
import type { PurchaseFilters } from "@/features/purchases/api/contract";
import { getVendors } from "@/features/suppliers/api/vendorApi";
import { RecordPurchaseDialog } from "@/features/purchases/components/RecordPurchaseDialog";
import { PayBillDialog } from "@/features/purchases/components/PayBillDialog";
import { PayBillsDialog } from "@/features/purchases/components/PayBillsDialog";
import { isOverdue, PURCHASE_STATUS_LABEL, purchaseStatusVariant } from "@/features/purchases/lib/status";
import { AttachmentsButton } from "@/features/attachments/components/AttachmentsButton";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { SearchInput, SegmentedControl, SelectInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateId, formatRupiah, formatRupiahShort } from "@/lib/format";

type StatusFilter = NonNullable<PurchaseFilters["paymentStatus"]>;

export function PurchasesPage() {
  // Vendors lived in Pengaturan until accounting parity P6; Jurnal keeps them under Pembelian.
  const [params] = useSearchParams();
  const canSeeMaster = useAuthStore((st) => st.hasPermission(PERMISSIONS.SUPPLIERS_VIEW));
  const [view, setView] = useState<"tagihan" | "vendor">(() =>
    params.get("tab") === "vendor" && canSeeMaster ? "vendor" : "tagihan",
  );
  const [status, setStatus] = useState<StatusFilter>("open");
  const [supplierId, setSupplierId] = useState("");
  const [search, setSearch] = useState("");
  const [recording, setRecording] = useState(false);
  const [paying, setPaying] = useState<PurchaseView | null>(null);
  const [payingMany, setPayingMany] = useState(false);

  const list = useQuery({
    queryKey: [...scopeKey(), "purchases", status, supplierId, search],
    queryFn: () => getPurchases({ paymentStatus: status, supplierId: supplierId || undefined, search }),
  });
  const vendors = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors });

  const rows = list.data ?? [];
  const owed = rows.filter((r) => r.paymentStatus === "unpaid" || r.paymentStatus === "partial");
  const totalOwed = owed.reduce((s, r) => s + r.outstanding, 0);
  const overdue = owed.filter((r) => isOverdue(r));

  const columns: Column<PurchaseView>[] = [
    {
      key: "number",
      header: "Tagihan",
      render: (row) => (
        <>
          <Link to={`/purchases/${row.id}`} className="data block text-xs text-ink underline-offset-2 hover:underline">
            {row.purchaseNumber}
          </Link>
          <span className="text-2xs text-ink-muted">
            {row.scheduleAgreementId ? "Penebusan SA" : (row.vendorInvoiceNumber ?? "—")}
          </span>
        </>
      ),
      sortValue: (row) => row.purchaseNumber,
    },
    {
      key: "vendor",
      header: "Vendor",
      render: (row) => <span className="text-sm text-ink">{row.supplierName ?? "—"}</span>,
      sortValue: (row) => row.supplierName ?? "",
    },
    {
      key: "date",
      header: "Tanggal",
      render: (row) => <span className="data text-xs">{formatDateId(row.redeemedAt)}</span>,
      sortValue: (row) => row.redeemedAt,
    },
    {
      key: "due",
      header: "Jatuh tempo",
      render: (row) => (
        <span className={isOverdue(row) ? "data text-xs font-semibold text-rust-ink" : "data text-xs"}>
          {formatDateId(row.dueDate)}
        </span>
      ),
      sortValue: (row) => row.dueDate,
    },
    {
      key: "total",
      header: "Total",
      align: "right",
      render: (row) => <span className="data block">{formatRupiah(row.totalAmount)}</span>,
      sortValue: (row) => row.totalAmount,
    },
    {
      key: "outstanding",
      header: "Sisa",
      align: "right",
      render: (row) => (
        <span className="data block font-medium">
          {row.paymentStatus === "void" ? "—" : formatRupiah(row.outstanding)}
        </span>
      ),
      sortValue: (row) => row.outstanding,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge label={PURCHASE_STATUS_LABEL[row.paymentStatus]} variant={purchaseStatusVariant(row)} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          {(row.paymentStatus === "unpaid" || row.paymentStatus === "partial") && (
            <CanAccess permission={PERMISSIONS.PURCHASES_VERIFY}>
              <Button variant="outline" size="xs" onClick={() => setPaying(row)}>
                <CircleDollarSign className="h-3 w-3" /> Bayar
              </Button>
            </CanAccess>
          )}
          <AttachmentsButton ownerType="purchase" ownerId={row.id} label={row.purchaseNumber} />
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Pembelian"
        description="Tagihan dari vendor -- penebusan SA dan pembelian umum -- dan pembayarannya, sekaligus atau bertahap."
        actions={
          <div className="flex gap-2">
            <CanAccess permission={PERMISSIONS.PURCHASES_VERIFY}>
              <Button variant="outline" onClick={() => setPayingMany(true)}>
                <Layers className="h-3.5 w-3.5" /> Bayar beberapa
              </Button>
            </CanAccess>
            <CanAccess permission={PERMISSIONS.PURCHASES_CREATE}>
              <Button onClick={() => setRecording(true)}>
                <Plus className="h-3.5 w-3.5" /> Tagihan vendor
              </Button>
            </CanAccess>
          </div>
        }
        meta={
          <span className="text-xs text-ink-muted">
            Hutang <span className="data font-semibold text-ink">{formatRupiahShort(totalOwed)}</span> ·{" "}
            <span className={overdue.length ? "data font-semibold text-rust-ink" : "data"}>{overdue.length}</span> lewat jatuh tempo
          </span>
        }
      />
      {canSeeMaster && (
        <SegmentedControl<"tagihan" | "vendor">
          value={view}
          onChange={setView}
          options={[
            { value: "tagihan", label: "Tagihan vendor" },
            { value: "vendor", label: "Vendor" },
          ]}
        />
      )}
      {view === "vendor" && <VendorSection />}
      {view === "tagihan" && (
        <>

      <Panel>
        <PanelHeader
          title="Daftar tagihan vendor"
          hint={`${rows.length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Nomor, no. tagihan vendor, vendor" className="w-72" />
              <SelectInput aria-label="Vendor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)} className="w-44">
                <option value="">Semua vendor</option>
                {(vendors.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
              </SelectInput>
              <SegmentedControl
                value={status}
                onChange={setStatus}
                options={[
                  { value: "open" as const, label: "Belum lunas" },
                  { value: "paid" as const, label: "Lunas" },
                  { value: "void" as const, label: "Batal" },
                  { value: "Semua" as const, label: "Semua" },
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
          spineFor={(row) => (row.paymentStatus === "paid" ? "text-pine" : isOverdue(row) ? "text-rust" : "text-draft")}
          pageSize={15}
          defaultSortKey="due"
          dense
          emptyIcon={ShoppingCart}
          emptyMessage="Tidak ada tagihan vendor"
          emptyDescription="Catat tagihan dari vendor; penebusan SA muncul di sini dengan sendirinya."
        />
      </Panel>

      <RecordPurchaseDialog open={recording} onClose={() => setRecording(false)} onSaved={() => list.refetch()} />
      <PayBillDialog bill={paying} onClose={() => setPaying(null)} onPaid={() => list.refetch()} />
      <PayBillsDialog open={payingMany} onClose={() => setPayingMany(false)} onPaid={() => list.refetch()} />
        </>
      )}
    </div>
  );
}
