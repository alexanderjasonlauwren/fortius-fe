/**
 * "Batalkan tagihan": ends a manual invoice raised in error. Its journals
 * are reversed and it leaves the receivable; the backend refuses a
 * delivery invoice (corrected with a credit note) or one with anything
 * already applied against it, and says which.
 */
import { useState } from "react";
import { voidInvoice, type InvoiceView } from "@/features/finance/api/financeApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface VoidInvoiceDialogProps {
  invoice: InvoiceView | null;
  onClose: () => void;
  onVoided?: () => void;
}

export function VoidInvoiceDialog({ invoice, onClose, onVoided }: VoidInvoiceDialogProps) {
  const [reason, setReason] = useState("");
  const run = useDeskMutation({
    mutationFn: () => voidInvoice(invoice!.id, invoice!.version, reason.trim()),
    errorTitle: "Tagihan tidak dapat dibatalkan",
    success: (row) => ({ title: `${row.nomor} dibatalkan`, description: "Jurnalnya sudah dibalik." }),
    onDone: () => { setReason(""); onVoided?.(); onClose(); },
  });

  return (
    <Dialog open={!!invoice} onOpenChange={(o) => !o && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Batalkan {invoice?.nomor}?</DialogTitle>
          <DialogDescription>
            Jurnal tagihan ini dibalik pada tanggal aslinya dan piutangnya hilang. Tagihan tetap
            tercatat dengan status Batal. Tidak dapat diurungkan.
          </DialogDescription>
        </DialogHeader>
        <Field label="Alasan pembatalan" htmlFor="void-reason" required>
          <TextareaInput id="void-reason" rows={3} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: salah pangkalan, tagihan diterbitkan ulang." />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={onClose} disabled={run.isPending}>Kembali</Button>
          <Button variant="destructive" disabled={reason.trim().length < 3 || run.isPending}
            onClick={() => run.mutate(undefined as never)}>
            Batalkan tagihan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
