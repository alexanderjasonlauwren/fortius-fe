/**
 * "Catat pengeluaran": one nota, one or more costs (BBM, tol, parkir...),
 * who was paid and the nota's number, paid from a named cash or bank
 * account -- or not yet paid ("Bayar nanti"), which is a debt to a vendor
 * and is recorded as a vendor bill instead, payable from Pembelian
 * (accounting parity P3). Also edits a pending expense.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import {
  createExpense,
  updateExpense,
  type CreateExpenseInput,
  type ExpenseView,
} from "@/features/expenses/api/expenseApi";
import { getExpenseCategories } from "@/features/expensecategories/api/expenseCategoryApi";
import type { ExpenseCategoryView } from "@/features/expensecategories/api/contract";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { getVendors } from "@/features/suppliers/api/vendorApi";
import { recordGeneralPurchase } from "@/features/purchases/api/purchaseApi";
import { laterAsBill, type ExpenseFormState as FormState, type ExpenseLineRow as LineRow } from "@/features/expenses/lib/laterAsBill";
import { useScope } from "@/features/tenancy/useScope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SegmentedControl, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { addDaysIso, todayIso } from "@/lib/date";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

let keySeq = 0;
const newLine = (l?: Partial<LineRow>): LineRow => ({ key: ++keySeq, category: "", description: "", amount: 0, ...l });

function initial(editing?: ExpenseView | null): FormState {
  if (editing) {
    return {
      incurredAt: editing.incurredAt,
      payMode: editing.paymentMode,
      bankAccountId: "",
      supplierId: editing.supplierId ?? "",
      payeeName: editing.payeeName ?? "",
      receiptNumber: editing.receiptNumber ?? "",
      description: editing.description ?? "",
      dueDate: editing.incurredAt,
      lines: (editing.lines.length
        ? editing.lines
        : [{ category: editing.category, amount: editing.amount }]
      ).map((l) => newLine({ category: l.category, description: l.description ?? "", amount: l.amount })),
    };
  }
  return {
    incurredAt: todayIso(), payMode: "cash", bankAccountId: "", supplierId: "", payeeName: "",
    receiptNumber: "", description: "", dueDate: addDaysIso(todayIso(), 14), lines: [newLine()],
  };
}

interface ExpenseFormDialogProps {
  open: boolean;
  /** A pending expense to edit; absent creates a new one. */
  editing?: ExpenseView | null;
  onClose: () => void;
}

export function ExpenseFormDialog({ open, editing, onClose }: ExpenseFormDialogProps) {
  const [form, setForm] = useState<FormState>(() => initial(editing));
  const [seenFor, setSeenFor] = useState<string | undefined>(editing?.id);
  if (open && seenFor !== (editing?.id ?? "new")) {
    // A different expense (or a fresh one) starts from its own values.
    setSeenFor(editing?.id ?? "new");
    setForm(initial(editing));
  }
  const { branchId } = useScope();

  const categories = useQuery({ queryKey: [...scopeKey(), "expense-categories"], queryFn: getExpenseCategories, enabled: open });
  const accounts = useQuery({ queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts, enabled: open });
  const vendors = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors, enabled: open });

  const groups = useMemo(() => {
    const byGroup = new Map<string, ExpenseCategoryView[]>();
    for (const c of (categories.data ?? []).filter((c) => c.status === "atv")) {
      if (!byGroup.has(c.groupLabel)) byGroup.set(c.groupLabel, []);
      byGroup.get(c.groupLabel)!.push(c);
    }
    return [...byGroup.entries()];
  }, [categories.data]);
  const payAccounts = (accounts.data ?? []).filter((a) => a.aktif && a.kind === (form.payMode === "bank" ? "bank" : "cash"));
  const defaultAccount = payAccounts.find((a) => a.utama) ?? payAccounts[0];

  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const setLine = (key: number, patch: Partial<LineRow>) =>
    set({ lines: form.lines.map((l) => (l.key === key ? { ...l, ...patch } : l)) });
  const total = form.lines.reduce((s, l) => s + (l.amount || 0), 0);

  const save = useDeskMutation({
    mutationFn: async () => {
      if (form.payMode === "later") {
        const bill = await recordGeneralPurchase(laterAsBill(form, categories.data ?? [], branchId ?? undefined));
        return `${bill.purchaseNumber} dicatat sebagai tagihan vendor`;
      }
      const input: CreateExpenseInput = {
        lines: form.lines.map((l) => ({ category: l.category, description: l.description, amount: l.amount })),
        paymentMode: form.payMode,
        bankAccountId: form.bankAccountId || defaultAccount?.id,
        incurredAt: form.incurredAt,
        description: form.description,
        supplierId: form.supplierId,
        payeeName: form.supplierId ? undefined : form.payeeName,
        receiptNumber: form.receiptNumber,
        branchId: branchId ?? undefined,
      };
      const row = editing ? await updateExpense(editing.id, editing.version, input) : await createExpense(input);
      return editing ? `${row.expenseNumber} diperbarui` : `${row.expenseNumber} dicatat`;
    },
    success: (title) => ({ title }),
    errorTitle: "Pengeluaran tidak tersimpan",
    onDone: () => { setSeenFor(undefined); onClose(); },
  });

  const linesOk = form.lines.length > 0 && form.lines.every((l) => l.category && l.amount > 0);
  const canSubmit =
    linesOk && !!form.incurredAt &&
    (form.payMode === "later" ? !!form.supplierId && form.dueDate >= form.incurredAt : !!defaultAccount || !!form.bankAccountId);

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) { setSeenFor(undefined); onClose(); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Ubah ${editing.expenseNumber}` : "Catat pengeluaran"}</DialogTitle>
          <DialogDescription>
            Satu nota boleh berisi beberapa biaya. Pengeluaran menunggu persetujuan sebelum masuk buku besar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Tanggal" htmlFor="exp-date" required>
              <TextInput id="exp-date" type="date" value={form.incurredAt} onChange={(e) => set({ incurredAt: e.target.value })} />
            </Field>
            <Field label="No. nota / kuitansi" htmlFor="exp-receipt">
              <TextInput id="exp-receipt" mono maxLength={100} value={form.receiptNumber} onChange={(e) => set({ receiptNumber: e.target.value })} />
            </Field>
            <Field label="Dibayar" htmlFor="exp-paymode" required className="sm:col-span-2">
              <SegmentedControl
                value={form.payMode}
                onChange={(payMode) => set({ payMode, bankAccountId: "" })}
                options={[
                  { value: "cash" as const, label: "Kas" },
                  { value: "bank" as const, label: "Bank" },
                  ...(editing ? [] : [{ value: "later" as const, label: "Bayar nanti (tagihan vendor)" }]),
                ]}
              />
            </Field>
            {form.payMode === "later" ? (
              <>
                <Field label="Vendor" htmlFor="exp-vendor" required>
                  <SelectInput id="exp-vendor" value={form.supplierId} onChange={(e) => set({ supplierId: e.target.value })}>
                    <option value="">— Pilih —</option>
                    {(vendors.data ?? []).filter((v) => v.status === "atv").map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                  </SelectInput>
                </Field>
                <Field label="Jatuh tempo" htmlFor="exp-due" required>
                  <TextInput id="exp-due" type="date" min={form.incurredAt} value={form.dueDate} onChange={(e) => set({ dueDate: e.target.value })} />
                </Field>
              </>
            ) : (
              <>
                <Field label={form.payMode === "bank" ? "Dari rekening" : "Dari kas"} htmlFor="exp-account" required>
                  <SelectInput id="exp-account" value={form.bankAccountId || defaultAccount?.id || ""}
                    onChange={(e) => set({ bankAccountId: e.target.value })}>
                    {payAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.kind === "cash" ? "Kas" : a.bank} · {a.nomorRekening}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Dibayar kepada" htmlFor="exp-payee" hint="Pilih vendor, atau tulis nama (SPBU, bengkel...).">
                  <div className="flex gap-2">
                    <SelectInput id="exp-payee" value={form.supplierId} onChange={(e) => set({ supplierId: e.target.value })} className="w-40">
                      <option value="">Bukan vendor</option>
                      {(vendors.data ?? []).filter((v) => v.status === "atv").map((v) => <option key={v.id} value={v.id}>{v.name}</option>)}
                    </SelectInput>
                    {!form.supplierId && (
                      <TextInput aria-label="Nama penerima" maxLength={200} value={form.payeeName}
                        onChange={(e) => set({ payeeName: e.target.value })} placeholder="Nama penerima" />
                    )}
                  </div>
                </Field>
              </>
            )}
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-muted">Rincian biaya</p>
            {form.lines.map((line, i) => (
              <div key={line.key} className="flex flex-wrap items-end gap-2">
                <Field label={i === 0 ? "Kategori" : undefined} htmlFor={`exp-cat-${line.key}`} className="w-48">
                  <SelectInput id={`exp-cat-${line.key}`} value={line.category} onChange={(e) => setLine(line.key, { category: e.target.value })}>
                    <option value="">— Pilih —</option>
                    {groups.map(([group, cats]) => (
                      <optgroup key={group} label={group}>
                        {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </optgroup>
                    ))}
                  </SelectInput>
                </Field>
                <Field label={i === 0 ? "Uraian" : undefined} htmlFor={`exp-desc-${line.key}`} className="min-w-[10rem] flex-1">
                  <TextInput id={`exp-desc-${line.key}`} maxLength={500} value={line.description}
                    onChange={(e) => setLine(line.key, { description: e.target.value })} />
                </Field>
                <Field label={i === 0 ? "Nilai" : undefined} htmlFor={`exp-amt-${line.key}`} className="w-36">
                  <TextInput id={`exp-amt-${line.key}`} type="number" min={1} mono value={line.amount}
                    onChange={(e) => setLine(line.key, { amount: Number(e.target.value) })} />
                </Field>
                <Button type="button" variant="ghost" size="icon-xs" aria-label="Hapus baris" disabled={form.lines.length <= 1}
                  onClick={() => set({ lines: form.lines.filter((l) => l.key !== line.key) })}>
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <Button type="button" variant="outline" size="sm" onClick={() => set({ lines: [...form.lines, newLine()] })}>
                <Plus className="h-3.5 w-3.5" /> Tambah biaya
              </Button>
              <p className="text-xs text-ink-muted">Total: <span className="data font-semibold text-ink">{formatRupiah(total)}</span></p>
            </div>
          </div>

          <Field label="Catatan" htmlFor="exp-notes">
            <TextareaInput id="exp-notes" rows={2} value={form.description} onChange={(e) => set({ description: e.target.value })} />
          </Field>
          {form.payMode === "later" && (
            <p className="text-xs text-ink-muted">
              Belum dibayar berarti berhutang ke vendor: dicatat sebagai tagihan vendor di Pembelian, dengan biaya
              masuk ke akun kategorinya, lalu dibayar dari sana.
            </p>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Batal</Button>
          <Button type="button" disabled={!canSubmit || save.isPending} onClick={() => save.mutate(undefined as never)}>
            {form.payMode === "later" ? "Catat tagihan vendor" : editing ? "Simpan perubahan" : "Simpan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
