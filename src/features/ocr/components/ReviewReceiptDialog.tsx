/**
 * The reviewer's decision on one receipt: approve (archive under a category,
 * optionally filing an expense from a chosen cash or bank account), send it
 * back for another look, or reject it -- each with a note.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileSearch } from "lucide-react";
import { reviewReceipt, type ReceiptExtraction } from "@/features/ocr/api/ocrApi";
import type { ReviewReceiptInput } from "@/features/ocr/api/contract";
import { useOpenReceipt } from "@/features/ocr/hooks/useOpenReceipt";
import type { PaymentMode } from "@/features/expenses/api/contract";
import { getExpenseCategories } from "@/features/expensecategories/api/expenseCategoryApi";
import type { ExpenseCategoryView } from "@/features/expensecategories/api/contract";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SegmentedControl, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { formatDateId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";
import { todayIso } from "@/lib/date";

type Outcome = ReviewReceiptInput["outcome"];

interface FormState {
  outcome: Outcome;
  note: string;
  category: string;
  fileExpense: boolean;
  paymentMode: PaymentMode;
  bankAccountId: string;
  incurredAt: string;
  description: string;
}

const initial = (row: ReceiptExtraction): FormState => ({
  outcome: "approved",
  note: "",
  category: row.category ?? "",
  fileExpense: true,
  paymentMode: "cash",
  bankAccountId: "",
  incurredAt: row.txnDate ?? todayIso(),
  description: row.merchantName ?? "",
});

interface Props {
  receipt: ReceiptExtraction | null;
  onClose: () => void;
  onReviewed: () => void;
}

export function ReviewReceiptDialog({ receipt, onClose, onReviewed }: Props) {
  const [form, setForm] = useState<FormState | null>(null);
  const [seenFor, setSeenFor] = useState<string | undefined>();
  if (receipt && seenFor !== receipt.id) {
    setSeenFor(receipt.id);
    setForm(initial(receipt));
  }
  const { open: openFile, opening } = useOpenReceipt();

  const categories = useQuery({ queryKey: [...scopeKey(), "expense-categories"], queryFn: getExpenseCategories, enabled: !!receipt });
  const accounts = useQuery({ queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts, enabled: !!receipt });
  const groups = useMemo(() => {
    const byGroup = new Map<string, ExpenseCategoryView[]>();
    for (const c of (categories.data ?? []).filter((c) => c.status === "atv")) {
      if (!byGroup.has(c.groupLabel)) byGroup.set(c.groupLabel, []);
      byGroup.get(c.groupLabel)!.push(c);
    }
    return [...byGroup.entries()];
  }, [categories.data]);

  const close = () => { setSeenFor(undefined); onClose(); };
  const save = useDeskMutation({
    mutationFn: (f: FormState) => reviewReceipt({
      id: receipt!.id,
      outcome: f.outcome,
      note: f.note,
      category: f.category || undefined,
      expense: f.fileExpense ? {
        paymentMode: f.paymentMode,
        bankAccountId: f.bankAccountId || undefined,
        incurredAt: f.incurredAt,
        description: f.description,
      } : undefined,
    }),
    success: (result, f) => {
      if (result.expenseError) return { title: "Bukti diarsipkan, pengeluaran gagal dibuat", description: result.expenseError, tone: "warning" as const };
      if (f.outcome === "needs_review") return { title: "Bukti dikembalikan untuk dicek ulang" };
      if (f.outcome === "rejected") return { title: "Bukti ditolak" };
      return { title: result.expenseId ? "Bukti diarsipkan, pengeluaran menunggu persetujuan" : "Bukti diarsipkan" };
    },
    errorTitle: "Hasil pemeriksaan tidak tersimpan",
    onDone: () => { onReviewed(); close(); },
  });

  if (!receipt || !form) return null;
  const set = (patch: Partial<FormState>) => setForm({ ...form, ...patch });
  const approving = form.outcome === "approved";
  // An expense needs an amount: without one the box stays unticked.
  const filing = approving && form.fileExpense && !!receipt.totalAmount;
  const payAccounts = (accounts.data ?? []).filter((a) => a.aktif && a.kind === form.paymentMode);
  const defaultAccount = payAccounts.find((a) => a.utama) ?? payAccounts[0];
  const canSubmit = approving
    ? !!form.category && (!filing || (!!form.incurredAt && (!!form.bankAccountId || !!defaultAccount)))
    : !!form.note.trim();

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={(e) => { e.preventDefault(); if (canSubmit) save.mutate({ ...form, fileExpense: filing, bankAccountId: form.bankAccountId || defaultAccount?.id || "" }); }}>
          <DialogHeader>
            <DialogTitle>Periksa bukti</DialogTitle>
            <DialogDescription>
              {receipt.merchantName || "Merchant belum diisi"} · {receipt.txnDate ? formatDateId(receipt.txnDate) : "tanpa tanggal"} ·{" "}
              {receipt.totalAmount ? formatRupiah(receipt.totalAmount) : "nilai belum diisi"}
            </DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <div className="col-span-2 flex items-center justify-between gap-3 rounded-md border border-line px-3 py-2 text-sm">
              <span className="data truncate text-ink-muted">{receipt.fileName ?? "—"}</span>
              {receipt.hasFile ? (
                <Button type="button" size="sm" variant="outline" disabled={opening === receipt.id} onClick={() => void openFile(receipt.id)}>
                  <FileSearch className="h-3.5 w-3.5" /> Lihat bukti
                </Button>
              ) : <span className="text-2xs text-ink-muted">Dicatat tanpa berkas</span>}
            </div>
            {receipt.note && (
              <p className="col-span-2 text-xs text-ink-muted">Catatan pemeriksaan sebelumnya: {receipt.note}</p>
            )}
            <Field className="col-span-2" label="Keputusan" htmlFor="ocr-outcome">
              <SegmentedControl value={form.outcome} onChange={(outcome) => set({ outcome })}
                options={[
                  { value: "approved" as const, label: "Setujui" },
                  { value: "needs_review" as const, label: "Perlu dicek ulang" },
                  { value: "rejected" as const, label: "Tolak" },
                ]} />
            </Field>
            {approving && (
              <>
                <Field label="Kategori" htmlFor="ocr-category" required>
                  <SelectInput id="ocr-category" value={form.category} onChange={(e) => set({ category: e.target.value })}>
                    <option value="">— Pilih —</option>
                    {groups.map(([group, cats]) => (
                      <optgroup key={group} label={group}>
                        {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </optgroup>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Buat pengeluaran" htmlFor="ocr-file-expense"
                  hint={receipt.totalAmount ? undefined : "Isi nilai bukti dulu untuk membuat pengeluaran."}>
                  <label className="flex h-10 items-center gap-2 text-sm">
                    <input id="ocr-file-expense" type="checkbox" checked={filing} disabled={!receipt.totalAmount}
                      onChange={(e) => set({ fileExpense: e.target.checked })} />
                    Catat sebagai pengeluaran
                  </label>
                </Field>
              </>
            )}
            {filing && (
              <>
                <Field label="Dibayar dari" htmlFor="ocr-mode">
                  <SegmentedControl value={form.paymentMode} onChange={(paymentMode) => set({ paymentMode, bankAccountId: "" })}
                    options={[{ value: "cash" as const, label: "Kas" }, { value: "bank" as const, label: "Bank" }]} />
                </Field>
                <Field label={form.paymentMode === "bank" ? "Rekening" : "Kas"} htmlFor="ocr-account" required>
                  <SelectInput id="ocr-account" value={form.bankAccountId || defaultAccount?.id || ""}
                    onChange={(e) => set({ bankAccountId: e.target.value })}>
                    {payAccounts.length === 0 && <option value="">Belum ada akun aktif</option>}
                    {payAccounts.map((a) => (
                      <option key={a.id} value={a.id}>{a.kind === "cash" ? "Kas" : a.bank} · {a.nomorRekening}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Tanggal pengeluaran" htmlFor="ocr-incurred" required>
                  <TextInput id="ocr-incurred" type="date" value={form.incurredAt} onChange={(e) => set({ incurredAt: e.target.value })} />
                </Field>
                <Field label="Uraian" htmlFor="ocr-desc">
                  <TextInput id="ocr-desc" maxLength={500} value={form.description} onChange={(e) => set({ description: e.target.value })} />
                </Field>
              </>
            )}
            <Field className="col-span-2" label="Catatan pemeriksaan" htmlFor="ocr-note" required={!approving}
              hint={approving ? undefined : "Tulis apa yang perlu diperbaiki atau alasan penolakan."}>
              <TextareaInput id="ocr-note" maxLength={2000} value={form.note} onChange={(e) => set({ note: e.target.value })} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Batal</Button>
            <Button type="submit" disabled={save.isPending || !canSubmit}>
              {approving ? "Setujui" : form.outcome === "rejected" ? "Tolak bukti" : "Kembalikan"}
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
