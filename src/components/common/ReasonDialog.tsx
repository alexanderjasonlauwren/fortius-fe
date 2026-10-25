/**
 * A destructive confirmation that needs a reason -- voiding a bill, a
 * payment, a document. The reason is what an auditor asks about first, so
 * it is required, not optional.
 */
import { useState } from "react";
import { Field, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

interface ReasonDialogProps {
  open: boolean;
  title: string;
  description: string;
  confirmLabel: string;
  placeholder?: string;
  pending?: boolean;
  onConfirm: (reason: string) => void;
  onClose: () => void;
}

export function ReasonDialog({
  open, title, description, confirmLabel, placeholder, pending, onConfirm, onClose,
}: ReasonDialogProps) {
  const [reason, setReason] = useState("");
  const close = () => { setReason(""); onClose(); };
  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{title}</DialogTitle>
          <DialogDescription>{description}</DialogDescription>
        </DialogHeader>
        <Field label="Alasan" htmlFor="reason-dialog-text" required>
          <TextareaInput id="reason-dialog-text" rows={3} value={reason} placeholder={placeholder}
            onChange={(e) => setReason(e.target.value)} />
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={close} disabled={pending}>Kembali</Button>
          <Button variant="destructive" disabled={reason.trim().length < 3 || pending}
            onClick={() => onConfirm(reason.trim())}>
            {confirmLabel}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
