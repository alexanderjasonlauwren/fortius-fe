/**
 * The reviewer's decision on one receipt: approve (archive under a category,
 * optionally filing an expense from a chosen cash or bank account), send it
 * back for another look, or reject it -- each with a note.
 *
 * The values are the OCR engine's reading, each shown with the printed line
 * it came from and how sure the engine was; the reviewer corrects what is
 * wrong, or types what the engine could not read. Only changed values are
 * sent back, so the engine's own answer stays beside the correction.
 */
import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileSearch } from "lucide-react";
import { reviewReceipt, type ReceiptExtraction } from "@/features/ocr/api/ocrApi";
import type { Confidence, ReviewReceiptInput } from "@/features/ocr/api/contract";
import { useOpenReceipt } from "@/features/ocr/hooks/useOpenReceipt";
import { CONFIDENCE_LABEL, CONFIDENCE_VARIANT, isPangkalanPayment } from "@/features/ocr/lib/status";
import { correctionsOf } from "@/features/ocr/lib/corrections";
import type { PaymentMode } from "@/features/expenses/api/contract";
import { getExpenseCategories } from "@/features/expensecategories/api/expenseCategoryApi";
import type { ExpenseCategoryView } from "@/features/expensecategories/api/contract";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SegmentedControl, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayIso } from "@/lib/date";
import { scopeKey } from "@/lib/scope";

type Outcome = ReviewReceiptInput["outcome"];

interface FormState {
  outcome: Outcome;
  note: string;
  merchantName: string;
  txnDate: string;
  totalAmount: number;
  referenceNo: string;
  category: string;
  fileExpense: boolean;
  paymentMode: PaymentMode;
  bankAccountId: string;
  incurredAt: string;
  description: string;
}

// The engine's payment methods that leave a bank account; cash is the till.
// e-toll and e-money cards are topped up separately, so neither is guessed.
const BANK_METHODS = new Set(["debit_card", "credit_card", "qris", "ewallet"]);

const initial = (row: ReceiptExtraction): FormState => ({
  outcome: "approved",
  note: "",
  merchantName: row.merchantName ?? "",
  txnDate: row.txnDate ?? "",
  totalAmount: row.totalAmount ?? 0,
  referenceNo: row.referenceNo ?? "",
  category: row.category ?? row.suggestedExpenseCategory ?? "",
  fileExpense: !isPangkalanPayment(row),
  paymentMode: row.paymentMethod && BANK_METHODS.has(row.paymentMethod) ? "bank" : "cash",
  bankAccountId: "",
  incurredAt: row.txnDate ?? todayIso(),
  description: row.merchantName ?? "",
});

/** The engine's printed line and confidence for one value, under its input. */
function Reading({ evidence, confidence }: { evidence?: string; confidence?: Confidence }) {
  if (!evidence && !confidence) return null;
  return (
    <span className="mt-1 flex items-center gap-2 text-2xs text-ink-muted">
      {confidence && <StatusBadge label={CONFIDENCE_LABEL[confidence]} variant={CONFIDENCE_VARIANT[confidence]} />}
      {evidence && <span className="data truncate" title={evidence}>“{evidence}”</span>}
    </span>
  );
}

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
  const active = useMemo(() => (categories.data ?? []).filter((c) => c.status === "atv"), [categories.data]);
  const groups = useMemo(() => {
    const byGroup = new Map<string, ExpenseCategoryView[]>();
    for (const c of active) {
      if (!byGroup.has(c.groupLabel)) byGroup.set(c.groupLabel, []);
      byGroup.get(c.groupLabel)!.push(c);
    }
    return [...byGroup.entries()];
  }, [active]);

  const close = () => { setSeenFor(undefined); onClose(); };
  const save = useDeskMutation({
    mutationFn: (f: FormState) => reviewReceipt({
      id: receipt!.id,
      outcome: f.outcome,
      note: f.note,
      corrections: correctionsOf(receipt!, f),
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
  const transfer = receipt.documentType === "bank_transfer";
  const pangkalanPayment = isPangkalanPayment(receipt);
  // A suggested category the tenant has since retired is not preselected.
  const category = active.some((c) => c.code === form.category) ? form.category : "";
  // An expense needs an amount, and is never filed from money received.
  const filing = approving && form.fileExpense && form.totalAmount > 0 && !pangkalanPayment;
  const payAccounts = (accounts.data ?? []).filter((a) => a.aktif && a.kind === form.paymentMode);
  const defaultAccount = payAccounts.find((a) => a.utama) ?? payAccounts[0];
  const canSubmit = approving
    ? !!category && (!filing || (!!form.incurredAt && (!!form.bankAccountId || !!defaultAccount)))
    : !!form.note.trim();
  const readByEngine = receipt.engine === "receipt-engine" && receipt.processStatus === "ready";

  return (
    <Dialog open onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-xl">
        <form onSubmit={(e) => {
          e.preventDefault();
          if (canSubmit) save.mutate({ ...form, category, fileExpense: filing, bankAccountId: form.bankAccountId || defaultAccount?.id || "" });
        }}>
          <DialogHeader>
            <DialogTitle>Periksa bukti</DialogTitle>
            <DialogDescription>
              {readByEngine
                ? `Dibaca mesin OCR sebagai ${transfer ? "bukti transfer" : "struk"}. Cocokkan dengan fotonya, perbaiki yang keliru.`
                : "Isi nilai dari fotonya, lalu putuskan."}
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

            {receipt.processStatus === "failed" && receipt.processError && (
              <p className="col-span-2 rounded-md bg-rust-soft px-3 py-2 text-xs text-rust-ink">{receipt.processError}</p>
            )}
            {receipt.duplicateOf && (
              <p className="col-span-2 flex items-start gap-2 rounded-md bg-rust-soft px-3 py-2 text-xs text-rust-ink">
                <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Nomor referensi bukti transfer ini sama dengan bukti yang sudah pernah diunggah. Kemungkinan klaim ganda; tolak kecuali ada alasan jelas.
              </p>
            )}
            {pangkalanPayment && (
              <p className="col-span-2 rounded-md bg-signal-soft px-3 py-2 text-xs text-signal-ink">
                Ini bukti penebusan LPG dari pangkalan: uang yang diterima, bukan pengeluaran. Arsipkan di sini, lalu catat di menu Pembayaran.
              </p>
            )}
            {receipt.reviewReasons.length > 0 && (
              <div className="col-span-2 text-2xs text-ink-muted">
                <span className="font-medium">Catatan mesin OCR:</span>
                <ul className="ml-4 list-disc">
                  {receipt.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}
                </ul>
              </div>
            )}
            {receipt.note && (
              <p className="col-span-2 text-xs text-ink-muted">Catatan pemeriksaan sebelumnya: {receipt.note}</p>
            )}

            <Field className="col-span-2" label={transfer ? "Penerima" : "Merchant"} htmlFor="ocr-merchant">
              <TextInput id="ocr-merchant" maxLength={255} value={form.merchantName}
                onChange={(e) => set({ merchantName: e.target.value })} placeholder={transfer ? "Nama penerima" : "SPBU 44.501.02"} />
            </Field>
            <Field label="Tanggal" htmlFor="ocr-date">
              <TextInput id="ocr-date" type="date" value={form.txnDate} onChange={(e) => set({ txnDate: e.target.value })} />
            </Field>
            <Field label="Nilai" htmlFor="ocr-total"
              hint={<Reading evidence={receipt.evidence.total} confidence={receipt.confidence.total} />}>
              <TextInput id="ocr-total" type="number" min={0} step="any" mono value={form.totalAmount || ""}
                onChange={(e) => set({ totalAmount: Number(e.target.value) })} />
            </Field>
            {transfer && (
              <Field className="col-span-2" label="No. referensi" htmlFor="ocr-reference"
                hint={<Reading evidence={receipt.evidence.reference_number} confidence={receipt.confidence.reference_number} />}>
                <TextInput id="ocr-reference" maxLength={255} mono value={form.referenceNo}
                  onChange={(e) => set({ referenceNo: e.target.value })} />
              </Field>
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
                <Field label="Kategori" htmlFor="ocr-category" required
                  hint={receipt.suggestedExpenseCategory && category === receipt.suggestedExpenseCategory && !receipt.category ? "Usulan mesin OCR" : undefined}>
                  <SelectInput id="ocr-category" value={category} onChange={(e) => set({ category: e.target.value })}>
                    <option value="">— Pilih —</option>
                    {groups.map(([group, cats]) => (
                      <optgroup key={group} label={group}>
                        {cats.map((c) => <option key={c.code} value={c.code}>{c.name}</option>)}
                      </optgroup>
                    ))}
                  </SelectInput>
                </Field>
                <Field label="Buat pengeluaran" htmlFor="ocr-file-expense"
                  hint={pangkalanPayment ? "Bukan pengeluaran." : form.totalAmount > 0 ? undefined : "Isi nilai dulu untuk membuat pengeluaran."}>
                  <label className="flex h-10 items-center gap-2 text-sm">
                    <input id="ocr-file-expense" type="checkbox" checked={filing} disabled={!(form.totalAmount > 0) || pangkalanPayment}
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
