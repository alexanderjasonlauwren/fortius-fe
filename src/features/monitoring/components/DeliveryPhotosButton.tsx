import { useState } from "react";
import { Camera } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { ATTACHMENT_PERMISSIONS } from "@/features/attachments/api/attachmentApi";
import { AttachmentsPanel } from "@/features/attachments/components/AttachmentsPanel";
import type { MonitoringRow } from "../types";

/**
 * The photos a driver took at a drop.
 *
 * Read-only here: the photo is the driver's evidence of what happened at the
 * gate, so the office looks at it rather than adds to it. Listed per surat
 * jalan because the driver's app attaches to the stop's first one and an
 * older stop may carry photos on another.
 */
export function DeliveryPhotosButton({ row }: { row: MonitoringRow }) {
  const [open, setOpen] = useState(false);
  return (
    <CanAccess permission={ATTACHMENT_PERMISSIONS.delivery.view}>
      <Button
        size="icon-xs"
        variant="ghost"
        onClick={() => setOpen(true)}
        title="Foto bukti pengiriman"
        aria-label={`Foto bukti ${row.kode}`}
      >
        <Camera className="h-3.5 w-3.5" />
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Foto bukti · {row.outlet}</DialogTitle>
            <DialogDescription>
              Foto yang diambil sopir saat menutup {row.kode}.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <div className="space-y-4">
              {row.suratJalan.map((sj) => (
                <section key={sj.id} className="space-y-1.5">
                  {row.suratJalan.length > 1 && (
                    <p className="data text-2xs text-ink-muted">{sj.kode}</p>
                  )}
                  <AttachmentsPanel ownerType="delivery" ownerId={sj.id} readOnly />
                </section>
              ))}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </CanAccess>
  );
}
