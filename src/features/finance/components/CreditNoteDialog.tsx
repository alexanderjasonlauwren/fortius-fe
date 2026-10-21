/**
 * "Nota kredit": reduces what an invoice bills -- returned cylinders, a
 * billing or price correction. Issued here; it lands on the invoice when
 * applied. Shared by the invoice list and the invoice's own page.
 */
import { useState } from "react";
import {
  CREDIT_NOTE_REASONS,
  submitCreditNote,
  type CreditNoteReason,
  type InvoiceView,
} from "@/features/finance/api/financeApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { todayIso } from "@/lib/date";
import { formatRupiah } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";

interface CreditNoteDialogProps {
  invoice: InvoiceView | null;
  onClose: () => void;
  onIssued?: () => void;
}

const empty = () => ({ jumlah: 0, alasan: "", kodeAlasan: "goods_return" as CreditNoteReason, tanggal: todayIso() });

export function CreditNoteDialog({ invoice, onClose, onIssued }: CreditNoteDialogProps) {
  const [form, setForm] = useState(empty);

  const issue = useDeskMutation({
    mutationFn: () =>
      submitCreditNote({
        outletId: invoice!.outletId,
        invoiceId: invoice!.id,
        jumlah: form.jumlah,
        alasan: form.alasan,
        kodeAlasan: form.kodeAlasan,
        tanggal: form.tanggal,
      }),
    errorTitle: "Nota kredit gagal diterbitkan",
    success: (n) => ({
      title: `${n.nomor} diterbitkan`,
      description: "Terapkan nota kredit ke tagihan untuk mengurangi piutangnya.",
    }),
    onDone: () => { setForm(empty()); onIssued?.(); onClose(); },
  });

  const tooMuch = !!invoice && form.jumlah > invoice.sisa;

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Nota kredit untuk {invoice?.nomor}</DialogTitle>
          <DialogDescription>
            Mengurangi jumlah yang ditagih, untuk barang yang dikembalikan atau koreksi penagihan. Dicatat sebagai retur penjualan.
          </DialogDescription>
        </DialogHeader>

        {invoice && (
          <div className="rounded-md border border-line bg-panel-sunk px-4 py-3 text-xs">
            <div className="flex justify-between gap-4">
              <span className="text-ink-muted">Sisa tagihan</span>
              <span className="data font-semibold text-ink">{formatRupiah(invoice.sisa)}</span>
            </div>
          </div>
        )}

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Nilai nota kredit" htmlFor="nk-jumlah" required
              error={tooMuch ? "Melebihi sisa tagihan" : undefined}>
              <TextInput
                id="nk-jumlah" type="number" mono min={1} max={invoice?.sisa}
                value={form.jumlah}
                onChange={(e) => setForm({ ...form, jumlah: Number(e.target.value) })}
              />
            </Field>
            <Field label="Tanggal" htmlFor="nk-tanggal" required>
              <TextInput id="nk-tanggal" type="date" value={form.tanggal}
                onChange={(e) => setForm({ ...form, tanggal: e.target.value })} />
            </Field>
          </div>
          <Field label="Jenis alasan" htmlFor="nk-kode" required>
            <SelectInput id="nk-kode" value={form.kodeAlasan}
              onChange={(e) => setForm({ ...form, kodeAlasan: e.target.value as CreditNoteReason })}>
              {Object.entries(CREDIT_NOTE_REASONS).map(([code, label]) => (
                <option key={code} value={code}>{label}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Keterangan" htmlFor="nk-alasan" required>
            <TextareaInput
              id="nk-alasan" rows={3} value={form.alasan}
              onChange={(e) => setForm({ ...form, alasan: e.target.value })}
              placeholder={`Contoh: 5 ${unitLabel()} dikembalikan karena segel rusak.`}
            />
          </Field>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button
            disabled={form.jumlah <= 0 || tooMuch || form.alasan.trim().length < 2 || !form.tanggal || issue.isPending}
            onClick={() => issue.mutate(undefined as never)}
          >
            Terbitkan nota kredit
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
