/**
 * "Pengeluaran & Kas Kecil": the daily cost book. Record a nota (one or
 * more costs), approve it into the ledger, and correct it the way a
 * bookkeeper does -- edit or withdraw while pending, void once approved
 * (accounting parity P3).
 */
import { ExpenseCategorySection } from "@/features/settings/components/ExpenseCategorySection";
import { SegmentedControl } from "@/components/common/Field";
import { useState } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Ban, Check, Pencil, Plus, ReceiptText, Undo2, X } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import {
  approveExpense,
  cancelExpense,
  EXPENSE_STATUS_LABEL,
  getExpenses,
  rejectExpense,
  type ExpenseView,
} from "@/features/expenses/api/expenseApi";
import type { ExpenseStatus } from "@/features/expenses/api/contract";
import { ExpenseFormDialog } from "@/features/expenses/components/ExpenseFormDialog";
import { getActivity } from "@/features/finance/api/activityApi";
import { DocumentActivityPanel } from "@/features/finance/components/DocumentActivityPanel";
import { AttachmentsPanel } from "@/features/attachments/components/AttachmentsPanel";
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
import { ReasonDialog } from "@/components/common/ReasonDialog";
import { RequestVoidDialog } from "@/features/approvals/components/RequestVoidDialog";
import { getStatusVariant, spineFor } from "@/lib/status";
import { formatDateId, formatRupiah } from "@/lib/format";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

export function ExpensePage() {
  // Kategori lived in Pengaturan until accounting parity P6; it belongs beside the expenses that use it.
  const [params] = useSearchParams();
  const canSeeMaster = useAuthStore((st) => st.hasPermission(PERMISSIONS.EXPENSE_CATEGORIES_VIEW));
  const [view, setView] = useState<"daftar" | "kategori">(() =>
    params.get("tab") === "kategori" && canSeeMaster ? "kategori" : "daftar",
  );
  // ?q= opens the list on one expense, e.g. from the receipt it was filed from.
  const [search, setSearch] = useState(params.get("q") ?? "");
  const [status, setStatus] = useState<ExpenseStatus | "Semua">("Semua");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [formOpen, setFormOpen] = useState(false);
  const [editing, setEditing] = useState<ExpenseView | null>(null);
  const [viewing, setViewing] = useState<ExpenseView | null>(null);
  const [approving, setApproving] = useState<ExpenseView | null>(null);
  const [secondApproverId, setSecondApproverId] = useState("");
  const [rejecting, setRejecting] = useState<ExpenseView | null>(null);
  const [reason, setReason] = useState("");
  const [withdrawing, setWithdrawing] = useState<ExpenseView | null>(null);
  const [voiding, setVoiding] = useState<ExpenseView | null>(null);

  const list = useQuery({
    queryKey: [...scopeKey(), "expenses", search, status, from, to],
    queryFn: () => getExpenses({ search, approvalStatus: status, from: from || undefined, to: to || undefined }),
  });
  const users = useQuery({
    queryKey: [...scopeKey(), "expense-approvers"],
    queryFn: () => getUsers(),
    enabled: !!approving,
  });
  const currentUserId = useAuthStore((state) => state.user?.id);

  const approve = useDeskMutation({
    mutationFn: ({ row, secondApproverId }: { row: ExpenseView; secondApproverId?: string }) =>
      approveExpense({ id: row.id, version: row.version, secondApproverId }),
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
  const withdraw = useDeskMutation({
    mutationFn: (why: string) => cancelExpense(withdrawing!.id, withdrawing!.version, why),
    errorTitle: "Pengeluaran tidak dapat ditarik",
    success: (row) => ({ title: `${row.expenseNumber} ditarik` }),
    onDone: () => setWithdrawing(null),
  });

  const rows = list.data ?? [];
  const pendingTotal = rows.filter((r) => r.approvalStatus === "pending").reduce((s, r) => s + r.amount, 0);
  const columns: Column<ExpenseView>[] = [
    {
      key: "number",
      header: "Nomor",
      render: (row) => (
        <button type="button" className="text-left" onClick={() => setViewing(row)}>
          <span className="data block text-xs text-ink underline-offset-2 hover:underline">{row.expenseNumber}</span>
          <span className="text-2xs text-ink-muted">
            {row.lines.map((l) => l.categoryName ?? l.category).join(", ") || row.category}
          </span>
        </button>
      ),
      sortValue: (row) => row.expenseNumber,
    },
    { key: "date", header: "Tanggal", render: (row) => <span className="data text-xs">{formatDateId(row.incurredAt)}</span>, sortValue: (row) => row.incurredAt },
    {
      key: "payee",
      header: "Dibayar kepada",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">{row.supplierName ?? row.payeeName ?? "—"}</span>
          {row.receiptNumber && <span className="data text-2xs text-ink-muted">{row.receiptNumber}</span>}
        </>
      ),
    },
    { key: "person", header: "Dikeluarkan oleh", render: (row) => <span className="text-xs">{row.incurredBy}</span> },
    {
      key: "amount",
      header: "Nilai",
      align: "right",
      render: (row) => (
        <>
          <span className="data block">{formatRupiah(row.amount)}</span>
          <span className="text-2xs text-ink-muted">{row.paymentMode === "cash" ? "Kas" : "Bank"}</span>
        </>
      ),
      sortValue: (row) => row.amount,
    },
    {
      key: "status",
      header: "Status",
      render: (row) => <StatusBadge label={EXPENSE_STATUS_LABEL[row.approvalStatus]} variant={getStatusVariant(EXPENSE_STATUS_LABEL[row.approvalStatus])} />,
    },
    {
      key: "actions",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex justify-end gap-1">
          {row.approvalStatus === "pending" && (
            <>
              <CanAccess permission={PERMISSIONS.EXPENSES_APPROVE}>
                <Button variant="ghost" size="icon-xs" aria-label={`Setujui ${row.expenseNumber}`} onClick={() => setApproving(row)}><Check className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Tolak ${row.expenseNumber}`} className="hover:bg-rust-soft hover:text-rust-ink" onClick={() => setRejecting(row)}><X className="h-3.5 w-3.5" /></Button>
              </CanAccess>
              <CanAccess permission={PERMISSIONS.EXPENSES_CREATE}>
                <Button variant="ghost" size="icon-xs" aria-label={`Ubah ${row.expenseNumber}`} onClick={() => { setEditing(row); setFormOpen(true); }}><Pencil className="h-3.5 w-3.5" /></Button>
                <Button variant="ghost" size="icon-xs" aria-label={`Tarik ${row.expenseNumber}`} onClick={() => setWithdrawing(row)}><Undo2 className="h-3.5 w-3.5" /></Button>
              </CanAccess>
            </>
          )}
          {row.approvalStatus === "approved" && (
            <CanAccess permissions={[PERMISSIONS.EXPENSES_VOID, PERMISSIONS.VOID_REQUESTS_CREATE]} requireAll>
              <Button variant="ghost" size="icon-xs" aria-label={`Ajukan pembatalan ${row.expenseNumber}`} className="hover:bg-rust-soft hover:text-rust-ink" onClick={() => setVoiding(row)}><Ban className="h-3.5 w-3.5" /></Button>
            </CanAccess>
          )}
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-5">
      <PageHeader
        eyebrow="Keuangan"
        title="Pengeluaran & Kas Kecil"
        description="Catat biaya operasional. Persetujuan memposting debit biaya per kategori dan kredit kas atau bank dalam satu transaksi."
        actions={<CanAccess permission={PERMISSIONS.EXPENSES_CREATE}><Button onClick={() => { setEditing(null); setFormOpen(true); }}><Plus className="h-3.5 w-3.5" />Catat pengeluaran</Button></CanAccess>}
        meta={<span className="text-xs text-ink-muted"><span className="data">{rows.length}</span> catatan · menunggu persetujuan <span className="data font-semibold text-ink">{formatRupiah(pendingTotal)}</span></span>}
      />
      {canSeeMaster && (
        <SegmentedControl<"daftar" | "kategori">
          value={view}
          onChange={setView}
          options={[
            { value: "daftar", label: "Pengeluaran" },
            { value: "kategori", label: "Kategori" },
          ]}
        />
      )}
      {view === "kategori" && <ExpenseCategorySection />}
      {view === "daftar" && (
        <>
      <Panel>
        <PanelHeader
          title="Daftar pengeluaran"
          hint={`${rows.length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Nomor, no. nota, penerima" className="w-60" />
              <TextInput type="date" aria-label="Dari tanggal" value={from} max={to || undefined} onChange={(e) => setFrom(e.target.value)} className="w-36 py-1.5 text-xs" />
              <TextInput type="date" aria-label="Sampai tanggal" value={to} min={from || undefined} onChange={(e) => setTo(e.target.value)} className="w-36 py-1.5 text-xs" />
              <SelectInput aria-label="Status" value={status} onChange={(event) => setStatus(event.target.value as ExpenseStatus | "Semua")}>
                <option value="Semua">Semua status</option>
                {Object.entries(EXPENSE_STATUS_LABEL).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
              </SelectInput>
            </div>
          }
        />
        <DataTable columns={columns} data={rows} isLoading={list.isLoading} rowKey={(row) => row.id} spineFor={(row) => spineFor(EXPENSE_STATUS_LABEL[row.approvalStatus])} pageSize={12} defaultSortKey="date" defaultSortDir="desc" dense emptyIcon={ReceiptText} emptyMessage="Belum ada pengeluaran" emptyDescription="Catat bahan bakar, tol, pemeliharaan, kas kecil, atau biaya operasional lainnya." />
      </Panel>

      <ExpenseFormDialog open={formOpen} editing={editing} onClose={() => { setFormOpen(false); setEditing(null); }} />
      <ExpenseDetailDialog expense={viewing} onClose={() => setViewing(null)} />

      <Dialog open={!!approving} onOpenChange={(open) => { if (!open) { setApproving(null); setSecondApproverId(""); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Setujui {approving?.expenseNumber}?</DialogTitle>
            <DialogDescription>Persetujuan langsung memposting jurnal; koreksi sesudahnya lewat pembatalan. Pilih penyetuju kedua bila nilainya melewati batas yang ditetapkan perusahaan.</DialogDescription>
          </DialogHeader>
          <Field label="Penyetuju kedua" htmlFor="expense-second-approver" hint="Wajib bila nilainya melewati batas yang ditetapkan perusahaan.">
            <SelectInput id="expense-second-approver" value={secondApproverId} onChange={(event) => setSecondApproverId(event.target.value)}>
              <option value="">Tidak dipilih</option>
              {(users.data ?? []).filter((user) => user.id !== currentUserId).map((user) => <option key={user.id} value={user.id}>{user.nama}</option>)}
            </SelectInput>
          </Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproving(null)}>Batal</Button>
            <Button disabled={approve.isPending} onClick={() => approving && approve.mutate({ row: approving, secondApproverId: secondApproverId || undefined })}>Setujui dan posting</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <Dialog open={!!rejecting} onOpenChange={(open) => !open && setRejecting(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Tolak {rejecting?.expenseNumber}?</DialogTitle>
            <DialogDescription>Pengeluaran yang ditolak tidak memposting jurnal.</DialogDescription>
          </DialogHeader>
          <Field label="Alasan" htmlFor="expense-reason" required><TextareaInput id="expense-reason" value={reason} onChange={(event) => setReason(event.target.value)} /></Field>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRejecting(null)}>Batal</Button>
            <Button variant="destructive" disabled={reject.isPending || reason.trim().length < 2} onClick={() => rejecting && reject.mutate({ row: rejecting, reason })}>Tolak</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
      <ReasonDialog
        open={!!withdrawing}
        title={`Tarik ${withdrawing?.expenseNumber}?`}
        description="Pengeluaran yang belum disetujui ditarik; tidak ada jurnal yang perlu dibalik."
        confirmLabel="Tarik pengeluaran"
        pending={withdraw.isPending}
        onConfirm={(why) => withdraw.mutate(why)}
        onClose={() => setWithdrawing(null)}
      />
      <RequestVoidDialog
        target={voiding ? {
          documentType: "expense", documentId: voiding.id, version: voiding.version, label: voiding.expenseNumber,
          effect: "Jurnal pengeluaran ini dibalik.",
        } : null}
        onClose={() => setVoiding(null)}
      />
        </>
      )}
    </div>
  );
}

/** One expense's lines, evidence and journals. */
function ExpenseDetailDialog({ expense, onClose }: { expense: ExpenseView | null; onClose: () => void }) {
  const activity = useQuery({
    queryKey: [...scopeKey(), "activity", "expense", expense?.id],
    queryFn: () => getActivity("expense", expense!.id),
    enabled: !!expense,
  });
  return (
    <Dialog open={!!expense} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{expense?.expenseNumber}</DialogTitle>
          <DialogDescription>
            {expense && `${formatDateId(expense.incurredAt)} · ${expense.supplierName ?? expense.payeeName ?? "—"}${expense.receiptNumber ? ` · nota ${expense.receiptNumber}` : ""}`}
          </DialogDescription>
        </DialogHeader>
        {expense && (
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="space-y-3">
              <ul className="divide-y divide-line rounded-md border border-line">
                {expense.lines.map((l, i) => (
                  <li key={i} className="flex justify-between gap-3 px-3 py-2 text-sm">
                    <span>
                      {l.categoryName ?? l.category}
                      {l.description && <span className="block text-2xs text-ink-muted">{l.description}</span>}
                    </span>
                    <span className="data whitespace-nowrap">{formatRupiah(l.amount)}</span>
                  </li>
                ))}
                <li className="flex justify-between px-3 py-2 text-sm font-semibold">
                  <span>Total</span>
                  <span className="data">{formatRupiah(expense.amount)}</span>
                </li>
              </ul>
              {expense.description && <p className="text-sm text-ink-muted">{expense.description}</p>}
              {(expense.voidReason || expense.rejectionReason) && (
                <p className="text-xs text-rust-ink">{EXPENSE_STATUS_LABEL[expense.approvalStatus]}: {expense.voidReason ?? expense.rejectionReason}</p>
              )}
              <AttachmentsPanel ownerType="expense" ownerId={expense.id} />
            </div>
            <DocumentActivityPanel activity={activity.data} isLoading={activity.isLoading} />
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
