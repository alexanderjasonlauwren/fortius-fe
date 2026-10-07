/**
 * Reverses a posted voucher -- refused for one still draft, since nothing
 * has been posted yet to reverse (mirrors VoidCashVoucherRequest's own
 * doc). Financial-statements plan's gap-closing phase, Phase B.
 */
import { useState } from "react";
import { voidCashVoucher, type CashVoucher } from "@/features/cashvouchers/api/cashVoucherApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface VoidVoucherDialogProps {
  voucher: CashVoucher | null;
  onClose: () => void;
  onVoided: () => void;
}

export function VoidVoucherDialog({ voucher, onClose, onVoided }: VoidVoucherDialogProps) {
  const [reason, setReason] = useState("");

  const voidMutation = useDeskMutation({
    mutationFn: () => voidCashVoucher(voucher!.id, voucher!.version, reason),
    success: (row) => ({ title: `${row.voucherNumber} dibatalkan`, description: "Jurnal pembalik telah diposting." }),
    errorTitle: "Pembatalan gagal",
    onDone: () => { setReason(""); onVoided(); onClose(); },
  });

  return (
    <Dialog open={!!voucher} onOpenChange={(next) => !next && (setReason(""), onClose())}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Batalkan {voucher?.voucherNumber}?</DialogTitle>
          <DialogDescription>
            Memposting jurnal pembalik dari yang sudah diposting. Tidak dapat diurungkan.
          </DialogDescription>
        </DialogHeader>
        <Field label="Alasan" htmlFor="void-reason" required>
          <TextareaInput id="void-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={voidMutation.isPending}>Batal</Button>
          <Button
            type="button" variant="destructive"
            disabled={voidMutation.isPending || reason.trim().length < 2}
            onClick={() => voidMutation.mutate(undefined as never)}
          >
            Batalkan voucher
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
