/**
 * Bukti pengeluaran: receipts uploaded with their file, reviewed (approve
 * under a category and optionally file an expense, send back, or reject,
 * each with a note), and linked to the expense they became (parity P3).
 */
import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { FileSearch, ScanLine, Upload } from "lucide-react";
import { Link } from "react-router-dom";
import { scopeKey } from "@/lib/scope";
import { getReceipts, type ReceiptExtraction, type ReceiptStatus } from "@/features/ocr/api/ocrApi";
import { getExpenseCategories } from "@/features/expensecategories/api/expenseCategoryApi";
import { UploadReceiptDialog } from "@/features/ocr/components/UploadReceiptDialog";
import { ReviewReceiptDialog } from "@/features/ocr/components/ReviewReceiptDialog";
import { useOpenReceipt } from "@/features/ocr/hooks/useOpenReceipt";
import { isReviewable, RECEIPT_STATUS_LABEL, RECEIPT_STATUS_VARIANT } from "@/features/ocr/lib/status";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { SearchInput, SelectInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { formatDateId, formatRupiah } from "@/lib/format";

export function OcrPage() {
  const queryClient = useQueryClient();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ReceiptStatus | "Semua">("Semua");
  const [uploading, setUploading] = useState(false);
  const [reviewing, setReviewing] = useState<ReceiptExtraction | null>(null);
  const { open: openFile, opening } = useOpenReceipt();

  const list = useQuery({ queryKey: [...scopeKey(), "expense-receipts", search], queryFn: () => getReceipts(search) });
  const categories = useQuery({ queryKey: [...scopeKey(), "expense-categories"], queryFn: getExpenseCategories });
  const categoryLabel = (code: string) => categories.data?.find((c) => c.code === code)?.name ?? code;
  const refresh = () => {
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "expense-receipts"] });
    void queryClient.invalidateQueries({ queryKey: [...scopeKey(), "expenses"] });
  };

  const all = list.data ?? [];
  const rows = status === "Semua" ? all : all.filter((r) => r.status === status);
  const waiting = all.filter((r) => isReviewable(r.status)).length;

  const columns: Column<ReceiptExtraction>[] = [
    {
      key: "merchant", header: "Bukti", sortValue: (row) => row.merchantName ?? "",
      render: (row) => (
        <span className="flex items-center gap-2">
          {row.hasFile ? (
            <Button variant="ghost" size="icon-xs" aria-label={`Lihat ${row.fileName ?? "bukti"}`} disabled={opening === row.id}
              onClick={() => void openFile(row.id)}>
              <FileSearch className="h-3.5 w-3.5" />
            </Button>
          ) : <span className="w-6" />}
          <span>
            <span className="block text-xs font-medium">{row.merchantName || "Merchant belum diisi"}</span>
            <span className="data text-2xs text-ink-muted">{row.fileName ?? "—"}{row.hasFile ? "" : " · tanpa berkas"}</span>
          </span>
        </span>
      ),
    },
    { key: "date", header: "Tanggal", render: (row) => <span className="data text-xs">{row.txnDate ? formatDateId(row.txnDate) : "—"}</span>, sortValue: (row) => row.txnDate ?? row.createdAt },
    { key: "amount", header: "Nilai", align: "right", render: (row) => <span className="data">{row.totalAmount ? formatRupiah(row.totalAmount) : "—"}</span>, sortValue: (row) => row.totalAmount ?? 0 },
    {
      key: "status", header: "Status",
      render: (row) => (
        <span>
          <StatusBadge
            label={row.status === "approved" && row.category ? `${RECEIPT_STATUS_LABEL.approved} · ${categoryLabel(row.category)}` : RECEIPT_STATUS_LABEL[row.status]}
            variant={RECEIPT_STATUS_VARIANT[row.status]} />
          {row.note && <span className="mt-0.5 block max-w-xs truncate text-2xs text-ink-muted" title={row.note}>{row.note}</span>}
        </span>
      ),
    },
    {
      key: "expense", header: "Pengeluaran",
      render: (row) => row.expenseNumber
        ? <Link className="data text-xs text-ink underline-offset-2 hover:underline" to={`/expenses?q=${encodeURIComponent(row.expenseNumber)}`}>{row.expenseNumber}</Link>
        : <span className="text-2xs text-ink-muted">—</span>,
    },
    {
      key: "action", header: "",
      render: (row) => isReviewable(row.status) ? (
        <CanAccess permission={PERMISSIONS.OCR_VERIFY}>
          <Button size="sm" variant="outline" onClick={() => setReviewing(row)}><ScanLine className="h-3.5 w-3.5" />Periksa</Button>
        </CanAccess>
      ) : null,
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Bukti Pengeluaran"
        description="Unggah foto struk atau PDF nota, periksa isinya, lalu arsipkan di kategori biaya dan catat sebagai pengeluaran."
        actions={
          <CanAccess permission={PERMISSIONS.OCR_CREATE}>
            <Button onClick={() => setUploading(true)}><Upload className="h-3.5 w-3.5" />Unggah bukti</Button>
          </CanAccess>
        }
      />
      <Panel>
        <PanelHeader
          title="Antrian bukti"
          hint={`${waiting} menunggu keputusan`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Merchant atau nama berkas" className="w-64" />
              <SelectInput aria-label="Status" value={status} onChange={(e) => setStatus(e.target.value as ReceiptStatus | "Semua")}>
                <option value="Semua">Semua status</option>
                {Object.entries(RECEIPT_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectInput>
            </div>
          }
        />
        <DataTable columns={columns} data={rows} isLoading={list.isLoading} rowKey={(row) => row.id} pageSize={12}
          defaultSortKey="date" defaultSortDir="desc" dense emptyIcon={ScanLine}
          emptyMessage={search || status !== "Semua" ? "Tidak ada bukti yang cocok" : "Belum ada bukti pengeluaran"}
          emptyDescription="Unggah struk bahan bakar, tol, parkir, pemeliharaan, atau kas kecil." />
      </Panel>
      <UploadReceiptDialog open={uploading} onClose={() => setUploading(false)} onUploaded={refresh} />
      <ReviewReceiptDialog receipt={reviewing} onClose={() => setReviewing(null)} onReviewed={refresh} />
    </div>
  );
}
