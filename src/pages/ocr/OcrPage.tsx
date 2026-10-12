import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Archive, Plus, ScanLine } from "lucide-react";
import { Link } from "react-router-dom";
import { scopeKey } from "@/lib/scope";
import { createReceipt, getReceipts, verifyReceipt, type ReceiptExtraction } from "@/features/ocr/api/ocrApi";
import type { ExpenseCategory, PaymentMode } from "@/features/expenses/api/contract";
import { getExpenseCategories } from "@/features/expensecategories/api/expenseCategoryApi";
import type { ExpenseCategoryView } from "@/features/expensecategories/api/contract";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Field, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateId, formatRupiah } from "@/lib/format";

interface UploadForm { fileName: string; merchantName: string; txnDate: string; totalAmount: number }
interface VerifyForm { row: ReceiptExtraction; category: ExpenseCategory; createExpense: boolean; paymentMode: PaymentMode; incurredAt: string; description: string }
const TODAY = new Date().toISOString().slice(0, 10);

export function OcrPage() {
  const [uploading, setUploading] = useState<UploadForm | null>(null);
  const [verifying, setVerifying] = useState<VerifyForm | null>(null);
  const list = useQuery({ queryKey: [...scopeKey(), "expense-receipts"], queryFn: getReceipts });
  const categories = useQuery({ queryKey: [...scopeKey(), "expense-categories"], queryFn: getExpenseCategories });
  const categoryLabel = (code: string) => categories.data?.find((c) => c.code === code)?.name ?? code;
  const categoryGroups = useMemo(() => {
    const byGroup = new Map<string, ExpenseCategoryView[]>();
    for (const c of categories.data ?? []) {
      if (!byGroup.has(c.groupLabel)) byGroup.set(c.groupLabel, []);
      byGroup.get(c.groupLabel)!.push(c);
    }
    return [...byGroup.entries()];
  }, [categories.data]);
  const create = useDeskMutation({
    mutationFn: createReceipt,
    errorTitle: "Bukti biaya tidak tersimpan",
    success: "Bukti biaya dicatat",
    onDone: () => setUploading(null),
  });
  const verify = useDeskMutation({
    mutationFn: (form: VerifyForm) => verifyReceipt({ id: form.row.id, category: form.category, createExpense: form.createExpense, paymentMode: form.paymentMode, incurredAt: form.incurredAt, description: form.description || undefined }),
    errorTitle: "Verifikasi gagal",
    success: (result) => result.expenseError ? { title: "Bukti diarsipkan, pengeluaran gagal dibuat", description: result.expenseError, tone: "warning" } : { title: result.expenseId ? "Bukti diarsipkan dan pengeluaran dibuat" : "Bukti diarsipkan" },
    onDone: () => setVerifying(null),
  });
  const rows = list.data ?? [];
  const columns: Column<ReceiptExtraction>[] = [
    { key: "merchant", header: "Bukti", render: (row) => <><span className="block text-xs font-medium">{row.merchantName || "Merchant belum diisi"}</span><span className="data text-2xs text-ink-muted">{row.fileName || row.id}</span></>, sortValue: (row) => row.merchantName ?? "" },
    { key: "date", header: "Tanggal", render: (row) => <span className="data text-xs">{row.txnDate ? formatDateId(row.txnDate) : "—"}</span>, sortValue: (row) => row.txnDate ?? "" },
    { key: "amount", header: "Nilai", align: "right", render: (row) => <span className="data">{row.totalAmount ? formatRupiah(row.totalAmount) : "—"}</span>, sortValue: (row) => row.totalAmount ?? 0 },
    { key: "status", header: "Status", render: (row) => <StatusBadge label={row.status === "approved" ? `Diarsipkan · ${row.category ? categoryLabel(row.category) : ""}` : "Menunggu review"} variant={row.status === "approved" ? "success" : "warning"} /> },
    { key: "action", header: "", render: (row) => row.status === "pending" ? <CanAccess permission={PERMISSIONS.OCR_VERIFY}><Button size="sm" variant="outline" onClick={() => setVerifying({ row, category: "", createExpense: true, paymentMode: "cash", incurredAt: row.txnDate ?? TODAY, description: row.merchantName ?? "" })}><ScanLine className="h-3.5 w-3.5" />Review</Button></CanAccess> : null },
  ];

  return <div className="space-y-5">
    <PageHeader eyebrow="Keuangan" title="Bukti Pengeluaran" description="Catat metadata bukti biaya secara manual, verifikasi kategorinya, lalu buat pengeluaran tertaut. Belum ada penyimpanan berkas atau mesin OCR pada backend." actions={<CanAccess permission={PERMISSIONS.OCR_CREATE}><Button onClick={() => setUploading({ fileName: "", merchantName: "", txnDate: TODAY, totalAmount: 0 })}><Plus className="h-3.5 w-3.5" />Catat bukti</Button></CanAccess>} />
    <Panel><PanelHeader title="Antrian bukti" hint={`${rows.filter((row) => row.status === "pending").length} menunggu review`} actions={<Button asChild size="sm" variant="outline"><Link to="/expenses"><Archive className="h-3.5 w-3.5" />Buka pengeluaran</Link></Button>} /><DataTable columns={columns} data={rows} isLoading={list.isLoading} rowKey={(row) => row.id} pageSize={12} defaultSortKey="date" defaultSortDir="desc" dense emptyIcon={ScanLine} emptyMessage="Belum ada bukti biaya" emptyDescription="Catat metadata pada struk bahan bakar, tol, pemeliharaan, atau kas kecil." /></Panel>
    <Dialog open={!!uploading} onOpenChange={(open) => !open && setUploading(null)}><DialogContent><form onSubmit={(event) => { event.preventDefault(); if (uploading?.fileName.trim()) create.mutate({ ...uploading, merchantName: uploading.merchantName || undefined, totalAmount: uploading.totalAmount || undefined }); }}><DialogHeader><DialogTitle>Catat bukti biaya</DialogTitle><DialogDescription>Versi ini mencatat metadata saja. Nama berkas bukan bukti bahwa isi file sudah diunggah.</DialogDescription></DialogHeader>{uploading && <div className="grid grid-cols-2 gap-4 py-4"><Field className="col-span-2" label="Nama berkas" htmlFor="ocr-file" required><TextInput id="ocr-file" value={uploading.fileName} onChange={(event) => setUploading({ ...uploading, fileName: event.target.value })} placeholder="struk-bbm-1309.jpg" /></Field><Field label="Merchant" htmlFor="ocr-merchant"><TextInput id="ocr-merchant" value={uploading.merchantName} onChange={(event) => setUploading({ ...uploading, merchantName: event.target.value })}/></Field><Field label="Tanggal" htmlFor="ocr-date"><TextInput id="ocr-date" type="date" value={uploading.txnDate} onChange={(event) => setUploading({ ...uploading, txnDate: event.target.value })}/></Field><Field className="col-span-2" label="Nilai" htmlFor="ocr-total"><TextInput id="ocr-total" type="number" min={0} step="any" mono value={uploading.totalAmount} onChange={(event) => setUploading({ ...uploading, totalAmount: Number(event.target.value) })}/></Field></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setUploading(null)}>Batal</Button><Button type="submit" disabled={create.isPending || !uploading?.fileName.trim()}>Simpan metadata</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={!!verifying} onOpenChange={(open) => !open && setVerifying(null)}><DialogContent><form onSubmit={(event) => { event.preventDefault(); if (verifying) verify.mutate(verifying); }}><DialogHeader><DialogTitle>Verifikasi bukti biaya</DialogTitle><DialogDescription>Arsipkan bukti dan, bila dipilih, buat catatan pengeluaran tertaut yang masih menunggu persetujuan.</DialogDescription></DialogHeader>{verifying && <div className="grid grid-cols-2 gap-4 py-4"><Field label="Kategori" htmlFor="ocr-category" required><SelectInput id="ocr-category" value={verifying.category} onChange={(event) => setVerifying({ ...verifying, category: event.target.value as ExpenseCategory })}><option value="">— Pilih —</option>{categoryGroups.map(([group, cats]) => <optgroup key={group} label={group}>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</optgroup>)}</SelectInput></Field><Field label="Dibayar dari" htmlFor="ocr-mode"><SelectInput id="ocr-mode" value={verifying.paymentMode} disabled={!verifying.createExpense} onChange={(event) => setVerifying({ ...verifying, paymentMode: event.target.value as PaymentMode })}><option value="cash">Kas</option><option value="bank">Bank</option></SelectInput></Field><Field label="Tanggal pengeluaran" htmlFor="ocr-incurred"><TextInput id="ocr-incurred" type="date" disabled={!verifying.createExpense} value={verifying.incurredAt} onChange={(event) => setVerifying({ ...verifying, incurredAt: event.target.value })}/></Field><Field label="Buat pengeluaran" htmlFor="ocr-create"><label className="flex h-10 items-center gap-2 text-sm"><input id="ocr-create" type="checkbox" checked={verifying.createExpense} onChange={(event) => setVerifying({ ...verifying, createExpense: event.target.checked })}/>Buat catatan tertaut</label></Field><Field className="col-span-2" label="Catatan" htmlFor="ocr-note"><TextareaInput id="ocr-note" disabled={!verifying.createExpense} value={verifying.description} onChange={(event) => setVerifying({ ...verifying, description: event.target.value })}/></Field></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setVerifying(null)}>Batal</Button><Button type="submit" disabled={verify.isPending || !!(verifying?.createExpense && (!verifying.incurredAt || !verifying.category))}>Verifikasi</Button></DialogFooter></form></DialogContent></Dialog>
  </div>;
}
