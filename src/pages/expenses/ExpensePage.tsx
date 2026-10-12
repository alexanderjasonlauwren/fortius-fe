import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Check, Plus, ReceiptText, X } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import {
  approveExpense,
  createExpense,
  EXPENSE_STATUS_LABEL,
  getExpenses,
  rejectExpense,
  type ExpenseView,
} from "@/features/expenses/api/expenseApi";
import { getExpenseCategories } from "@/features/expensecategories/api/expenseCategoryApi";
import type { ExpenseCategoryView } from "@/features/expensecategories/api/contract";
import type { ExpenseCategory, ExpenseStatus, PaymentMode } from "@/features/expenses/api/contract";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { useAuthStore } from "@/features/auth/store/authStore";
import { getUsers } from "@/features/users/api/userApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { Field, SearchInput, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface ExpenseForm {
  category: ExpenseCategory;
  amount: number;
  paymentMode: PaymentMode;
  incurredAt: string;
  description: string;
}

const EMPTY_FORM: ExpenseForm = {
  category: "",
  amount: 0,
  paymentMode: "cash",
  incurredAt: new Date().toISOString().slice(0, 10),
  description: "",
};

export function ExpensePage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<ExpenseStatus | "Semua">("Semua");
  const [form, setForm] = useState<ExpenseForm | null>(null);
  const [approving, setApproving] = useState<ExpenseView | null>(null);
  const [secondApproverId, setSecondApproverId] = useState("");
  const [rejecting, setRejecting] = useState<ExpenseView | null>(null);
  const [reason, setReason] = useState("");

  const list = useQuery({
    queryKey: [...scopeKey(), "expenses", search, status],
    queryFn: () => getExpenses({ search, approvalStatus: status }),
  });
  const categories = useQuery({
    queryKey: [...scopeKey(), "expense-categories"],
    queryFn: getExpenseCategories,
  });
  const categoryLabel = (code: string) => categories.data?.find((c) => c.code === code)?.name ?? code;
  const categoryGroups = useMemo(() => {
    const byGroup = new Map<string, ExpenseCategoryView[]>();
    for (const c of categories.data ?? []) {
      if (!byGroup.has(c.groupLabel)) byGroup.set(c.groupLabel, []);
      byGroup.get(c.groupLabel)!.push(c);
    }
    return [...byGroup.entries()];
  }, [categories.data]);
  const users = useQuery({
    queryKey: [...scopeKey(), "expense-approvers"],
    queryFn: () => getUsers(),
    enabled: !!approving,
  });
  const currentUserId = useAuthStore((state) => state.user?.id);
  const create = useDeskMutation({
    mutationFn: (value: ExpenseForm) => createExpense({ ...value, description: value.description || undefined }),
    errorTitle: "Pengeluaran tidak tersimpan",
    success: (row) => ({ title: `${row.expenseNumber} dicatat` }),
    onDone: () => setForm(null),
  });
  const approve = useDeskMutation({
    mutationFn: ({ row, secondApproverId }: { row: ExpenseView; secondApproverId?: string }) => approveExpense({ id: row.id, version: row.version, secondApproverId }),
    errorTitle: "Persetujuan gagal",
    success: (row) => ({ title: `${row.expenseNumber} disetujui`, description: "Jurnal biaya telah diposting." }),
    onDone: () => { setApproving(null); setSecondApproverId(""); },
  });
  const reject = useDeskMutation({
    mutationFn: ({ row, reason }: { row: ExpenseView; reason: string }) => rejectExpense({ id: row.id, version: row.version, reason }),
    errorTitle: "Penolakan gagal",
    success: (row) => ({ title: `${row.expenseNumber} ditolak`, tone: "warning" }),
    onDone: () => { setRejecting(null); setReason(""); },
  });

  const rows = list.data ?? [];
  const columns: Column<ExpenseView>[] = [
    { key: "number", header: "Nomor", render: (row) => <><span className="data block text-xs text-ink">{row.expenseNumber}</span><span className="text-2xs text-ink-muted">{categoryLabel(row.category)}</span></>, sortValue: (row) => row.expenseNumber },
    { key: "date", header: "Tanggal", render: (row) => <span className="data text-xs">{formatDateId(row.incurredAt)}</span>, sortValue: (row) => row.incurredAt },
    { key: "person", header: "Dikeluarkan oleh", render: (row) => <span className="text-xs">{row.incurredBy}</span> },
    { key: "amount", header: "Nilai", align: "right", render: (row) => <><span className="data block">{formatRupiah(row.amount)}</span><span className="text-2xs text-ink-muted">{row.paymentMode === "cash" ? "Kas" : "Bank"}</span></>, sortValue: (row) => row.amount },
    { key: "status", header: "Status", render: (row) => <StatusBadge label={EXPENSE_STATUS_LABEL[row.approvalStatus]} variant={getStatusVariant(EXPENSE_STATUS_LABEL[row.approvalStatus])} /> },
    { key: "actions", header: "", render: (row) => row.approvalStatus === "pending" ? <CanAccess permission={PERMISSIONS.EXPENSES_APPROVE}><div className="flex justify-end gap-1"><Button variant="ghost" size="icon-xs" aria-label={`Setujui ${row.expenseNumber}`} onClick={() => setApproving(row)}><Check className="h-3.5 w-3.5" /></Button><Button variant="ghost" size="icon-xs" aria-label={`Tolak ${row.expenseNumber}`} className="hover:bg-rust-soft hover:text-rust-ink" onClick={() => setRejecting(row)}><X className="h-3.5 w-3.5" /></Button></div></CanAccess> : null },
  ];

  return <div className="space-y-5">
    <PageHeader eyebrow="Keuangan" title="Pengeluaran & Kas Kecil" description="Catat biaya operasional. Persetujuan memposting debit biaya dan kredit kas atau bank dalam satu transaksi." actions={<CanAccess permission={PERMISSIONS.EXPENSES_CREATE}><Button onClick={() => setForm({ ...EMPTY_FORM })}><Plus className="h-3.5 w-3.5" />Catat pengeluaran</Button></CanAccess>} meta={<span className="text-xs text-ink-muted"><span className="data">{rows.length}</span> catatan</span>} />
    <Panel><PanelHeader title="Daftar pengeluaran" hint={`${rows.length} baris`} actions={<div className="flex gap-2"><SearchInput value={search} onChange={setSearch} placeholder="Nomor atau catatan" className="w-56"/><SelectInput value={status} onChange={(event) => setStatus(event.target.value as ExpenseStatus | "Semua")}><option value="Semua">Semua status</option>{Object.entries(EXPENSE_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</SelectInput></div>} />
      <DataTable columns={columns} data={rows} isLoading={list.isLoading} rowKey={(row) => row.id} spineFor={(row) => spineFor(EXPENSE_STATUS_LABEL[row.approvalStatus])} pageSize={12} defaultSortKey="date" defaultSortDir="desc" dense emptyIcon={ReceiptText} emptyMessage="Belum ada pengeluaran" emptyDescription="Catat bahan bakar, tol, pemeliharaan, kas kecil, atau biaya operasional lainnya." />
    </Panel>
    <Dialog open={!!form} onOpenChange={(open) => !open && setForm(null)}><DialogContent className="sm:max-w-lg"><form onSubmit={(event) => { event.preventDefault(); if (form && form.category && form.amount > 0 && form.incurredAt) create.mutate(form); }}><DialogHeader><DialogTitle>Catat pengeluaran</DialogTitle><DialogDescription>Catatan baru menunggu persetujuan sebelum masuk buku besar.</DialogDescription></DialogHeader>{form && <div className="grid grid-cols-2 gap-4 py-4"><Field label="Kategori" htmlFor="expense-category" required><SelectInput id="expense-category" value={form.category} onChange={(event) => setForm({ ...form, category: event.target.value as ExpenseCategory })}><option value="">— Pilih —</option>{categoryGroups.map(([group, cats]) => <optgroup key={group} label={group}>{cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}</optgroup>)}</SelectInput></Field><Field label="Dibayar dari" htmlFor="expense-mode" required><SelectInput id="expense-mode" value={form.paymentMode} onChange={(event) => setForm({ ...form, paymentMode: event.target.value as PaymentMode })}><option value="cash">Kas</option><option value="bank">Bank</option></SelectInput></Field><Field label="Tanggal" htmlFor="expense-date" required><TextInput id="expense-date" type="date" value={form.incurredAt} onChange={(event) => setForm({ ...form, incurredAt: event.target.value })}/></Field><Field label="Nilai" htmlFor="expense-amount" required><TextInput id="expense-amount" type="number" min={1} step="any" mono value={form.amount} onChange={(event) => setForm({ ...form, amount: Number(event.target.value) })}/></Field><Field className="col-span-2" label="Catatan" htmlFor="expense-description"><TextareaInput id="expense-description" rows={3} value={form.description} onChange={(event) => setForm({ ...form, description: event.target.value })}/></Field></div>}<DialogFooter><Button type="button" variant="outline" onClick={() => setForm(null)}>Batal</Button><Button type="submit" disabled={create.isPending || !form?.category || !form?.incurredAt || (form?.amount ?? 0) <= 0}>Simpan</Button></DialogFooter></form></DialogContent></Dialog>
    <Dialog open={!!approving} onOpenChange={(open) => { if (!open) { setApproving(null); setSecondApproverId(""); } }}><DialogContent><DialogHeader><DialogTitle>Setujui {approving?.expenseNumber}?</DialogTitle><DialogDescription>Persetujuan langsung memposting jurnal dan tidak dapat diedit. Pilih penyetuju kedua bila nilai ini melewati ambang tenant.</DialogDescription></DialogHeader><Field label="Penyetuju kedua" htmlFor="expense-second-approver" hint="Opsional kecuali server mewajibkannya berdasarkan ambang tenant."><SelectInput id="expense-second-approver" value={secondApproverId} onChange={(event) => setSecondApproverId(event.target.value)}><option value="">Tidak dipilih</option>{(users.data ?? []).filter((user) => user.id !== currentUserId).map((user) => <option key={user.id} value={user.id}>{user.nama}</option>)}</SelectInput></Field><DialogFooter><Button variant="outline" onClick={() => setApproving(null)}>Batal</Button><Button disabled={approve.isPending} onClick={() => approving && approve.mutate({ row: approving, secondApproverId: secondApproverId || undefined })}>Setujui dan posting</Button></DialogFooter></DialogContent></Dialog>
    <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}><DialogContent><DialogHeader><DialogTitle>Tolak {rejecting?.expenseNumber}?</DialogTitle><DialogDescription>Pengeluaran yang ditolak tidak memposting jurnal.</DialogDescription></DialogHeader><Field label="Alasan" htmlFor="expense-reason" required><TextareaInput id="expense-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></Field><DialogFooter><Button variant="outline" onClick={() => setRejecting(null)}>Batal</Button><Button variant="destructive" disabled={reject.isPending || reason.trim().length < 2} onClick={() => rejecting && reject.mutate({ row: rejecting, reason })}>Tolak</Button></DialogFooter></DialogContent></Dialog>
  </div>;
}
