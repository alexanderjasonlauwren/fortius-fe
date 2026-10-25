/**
 * "Bayar tagihan": pays part or all of one vendor bill. Each payment is its
 * own numbered document (BYR-...) with its own journal, so an instalment
 * can later be voided alone (accounting parity P3).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { recordPurchasePayment } from "@/features/purchases/api/purchaseApi";
import type { PurchaseView } from "@/features/purchases/api/contract";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useResettableState } from "@/hooks/useResettableState";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { todayIso } from "@/lib/date";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

interface PayBillDialogProps {
  bill: PurchaseView | null;
  onClose: () => void;
  onPaid: () => void;
}

export function PayBillDialog({ bill, onClose, onPaid }: PayBillDialogProps) {
  const accounts = useQuery({
    queryKey: [...scopeKey(), "bank-accounts"],
    queryFn: getBankAccounts,
    enabled: !!bill,
  });
  const active = (accounts.data ?? []).filter((a) => a.aktif);
  const fallback = active.find((a) => a.utama && a.kind === "bank") ?? active[0];

  // A different bill starts from its own outstanding amount.
  const [form, setForm] = useResettableState([bill?.id], () => ({
    amount: bill?.outstanding ?? 0,
    paidOn: todayIso(),
    bankAccountId: "",
    reference: "",
    notes: "",
  }));
  const [error, setError] = useState<string | null>(null);

  const pay = useDeskMutation({
    mutationFn: () =>
      recordPurchasePayment({
        purchaseId: bill!.id,
        amount: form.amount,
        paidOn: form.paidOn,
        bankAccountId: form.bankAccountId || fallback?.id,
        bankReference: form.reference,
        notes: form.notes,
      }),
    success: (row) => ({
      title: row.paymentStatus === "paid" ? `${row.purchaseNumber} lunas` : `${row.purchaseNumber} dibayar sebagian`,
      description: row.paymentStatus === "paid" ? undefined : `Sisa ${formatRupiah(row.outstanding)}.`,
    }),
    errorTitle: "Pembayaran gagal",
    onFail: (e) => setError(e.message),
    onDone: () => { setError(null); onPaid(); onClose(); },
  });

  const tooMuch = !!bill && form.amount > bill.outstanding;
  return (
    <Dialog open={!!bill} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Bayar {bill?.purchaseNumber}</DialogTitle>
          <DialogDescription>
            {bill?.supplierName} · sisa tagihan{" "}
            <span className="data font-semibold text-ink">{bill && formatRupiah(bill.outstanding)}</span>. Boleh
            dibayar sebagian.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Jumlah dibayar" htmlFor="pay-bill-amount" required error={tooMuch ? "Melebihi sisa tagihan" : undefined}>
            <TextInput id="pay-bill-amount" type="number" mono min={1} max={bill?.outstanding} value={form.amount}
              onChange={(e) => setForm({ ...form, amount: Number(e.target.value) })} />
          </Field>
          <Field label="Tanggal bayar" htmlFor="pay-bill-date" required>
            <TextInput id="pay-bill-date" type="date" value={form.paidOn}
              onChange={(e) => setForm({ ...form, paidOn: e.target.value })} />
          </Field>
          <Field label="Dibayar dari" htmlFor="pay-bill-account" required className="sm:col-span-2">
            <SelectInput id="pay-bill-account" value={form.bankAccountId || fallback?.id || ""}
              onChange={(e) => setForm({ ...form, bankAccountId: e.target.value })}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kind === "cash" ? "Kas" : a.bank} · {a.nomorRekening}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="No. referensi" htmlFor="pay-bill-ref" hint="Nomor transfer atau slip bank.">
            <TextInput id="pay-bill-ref" mono value={form.reference}
              onChange={(e) => setForm({ ...form, reference: e.target.value })} />
          </Field>
          <Field label="Catatan" htmlFor="pay-bill-notes">
            <TextInput id="pay-bill-notes" value={form.notes}
              onChange={(e) => setForm({ ...form, notes: e.target.value })} />
          </Field>
        </div>
        {error && <p className="text-xs text-rust-ink">{error}</p>}

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pay.isPending}>Batal</Button>
          <Button type="button" disabled={form.amount <= 0 || tooMuch || !fallback || pay.isPending}
            onClick={() => pay.mutate(undefined as never)}>
            Bayar {formatRupiah(form.amount)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
