/**
 * A paperclip on a list row that opens the document's AttachmentsPanel --
 * for lists whose rows have no detail page yet (accounting parity P3 adds
 * those, and mounts the panel there directly).
 */
import { useState } from "react";
import { Paperclip } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { ATTACHMENT_PERMISSIONS, type AttachmentOwnerType } from "../api/attachmentApi";
import { AttachmentsPanel } from "./AttachmentsPanel";

interface AttachmentsButtonProps {
  ownerType: AttachmentOwnerType;
  ownerId: string;
  /** The document's own number, for the dialog title. */
  label: string;
}

export function AttachmentsButton({ ownerType, ownerId, label }: AttachmentsButtonProps) {
  const [open, setOpen] = useState(false);
  return (
    <CanAccess permission={ATTACHMENT_PERMISSIONS[ownerType].view}>
      <Button
        type="button" variant="ghost" size="icon-xs"
        aria-label={`Lampiran ${label}`}
        onClick={() => setOpen(true)}
      >
        <Paperclip className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Lampiran {label}</DialogTitle>
            <DialogDescription>
              Bukti yang mendukung dokumen ini. File yang dilepas tetap disimpan untuk audit.
            </DialogDescription>
          </DialogHeader>
          {open && <AttachmentsPanel ownerType={ownerType} ownerId={ownerId} />}
        </DialogContent>
      </Dialog>
    </CanAccess>
  );
}
