/**
 * Marks a purchase paid -- debits payable, credits the chosen (or default)
 * bank/cash account (gap-closing plan, Phase F).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { payPurchase } from "@/features/purchases/api/purchaseApi";
import type { PurchaseView } from "@/features/purchases/api/contract";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/mocks/scope";

interface PayPurchaseDialogProps {
  purchase: PurchaseView | null;
  onClose: () => void;
  onPaid: () => void;
}

export function PayPurchaseDialog({ purchase, onClose, onPaid }: PayPurchaseDialogProps) {
  const [bankAccountId, setBankAccountId] = useState("");
  const [bankReference, setBankReference] = useState("");

  const bankAccounts = useQuery({
    queryKey: [...scopeKey(), "cash-bank", "bank-accounts"],
    queryFn: getBankAccounts,
    enabled: !!purchase,
  });

  const pay = useDeskMutation({
    mutationFn: () =>
      payPurchase({
        id: purchase!.id,
        version: purchase!.version,
        bankReference: bankReference || undefined,
        bankAccountId: bankAccountId || undefined,
      }),
    success: (row) => ({ title: `${row.purchaseNumber} dibayar` }),
    errorTitle: "Pembayaran gagal",
    onDone: () => { setBankAccountId(""); setBankReference(""); onPaid(); onClose(); },
  });

  return (
    <Dialog open={!!purchase} onOpenChange={(next) => !next && onClose()}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Bayar {purchase?.purchaseNumber}?</DialogTitle>
          <DialogDescription>
            Memposting jurnal debit hutang usaha / kredit kas atau bank sebesar{" "}
            {purchase && formatRupiah(purchase.totalAmount)}.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4">
          <Field label="Dibayar dari" htmlFor="pay-pur-bank" hint="Kosongkan untuk memakai rekening utama.">
            <SelectInput id="pay-pur-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
              <option value="">— Rekening utama —</option>
              {(bankAccounts.data ?? []).map((a) => (
                <option key={a.id} value={a.id}>
                  {a.kind === "cash" ? "Kas" : a.bank} {a.nomorRekening}
                </option>
              ))}
            </SelectInput>
          </Field>
          <Field label="Referensi" htmlFor="pay-pur-ref" hint="Nomor transfer atau referensi bank, opsional.">
            <TextInput id="pay-pur-ref" value={bankReference} onChange={(e) => setBankReference(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={pay.isPending}>
            Batal
          </Button>
          <Button type="button" disabled={pay.isPending} onClick={() => pay.mutate(undefined as never)}>
            Bayar
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
