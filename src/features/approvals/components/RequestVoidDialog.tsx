/**
 * "Ajukan pembatalan" (client answer 5): a void is asked for with a reason
 * and its evidence -- typically the bank mutation showing the same transfer
 * twice -- and runs only once someone else approves it under Persetujuan.
 * One dialog for every document that can be voided.
 *
 * The backend tries the void when the request is made and refuses it then
 * if it could never go through (a delivery invoice, a bill with payments),
 * so the requester hears it now rather than the approver later.
 */
import { useRef, useState } from "react";
import { FileText, Upload } from "lucide-react";
import { requestVoid, type VoidDocumentType } from "@/features/approvals/api/approvalsApi";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, uploadAttachment } from "@/features/attachments/api/attachmentApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";

export interface VoidTarget {
  documentType: VoidDocumentType;
  documentId: string;
  /** The bill a purchase payment belongs to. */
  parentId?: string;
  version: number;
  /** What the dialog calls it: "INV-SLT-…", "pembayaran BYR-…". */
  label: string;
  /** One line on what the void does to this document. */
  effect: string;
}

interface RequestVoidDialogProps {
  target: VoidTarget | null;
  onClose: () => void;
  onRequested?: () => void;
}

export function RequestVoidDialog({ target, onClose, onRequested }: RequestVoidDialogProps) {
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [tooBig, setTooBig] = useState(false);
  const input = useRef<HTMLInputElement>(null);

  function reset() {
    setReason("");
    setFile(null);
    setTooBig(false);
  }

  const run = useDeskMutation({
    mutationFn: async () => {
      const request = await requestVoid({
        documentType: target!.documentType,
        documentId: target!.documentId,
        parentId: target!.parentId,
        version: target!.version,
        reason: reason.trim(),
      });
      await uploadAttachment("void_request", request.id, file!);
      return request;
    },
    errorTitle: "Pembatalan tidak dapat diajukan",
    success: (row) => ({
      title: `Pembatalan ${row.documentNumber} diajukan`,
      description: "Menunggu persetujuan di menu Persetujuan. Dokumen belum berubah.",
    }),
    onDone: () => { reset(); onRequested?.(); onClose(); },
  });

  const ready = reason.trim().length >= 3 && !!file && !run.isPending;

  return (
    <Dialog open={!!target} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Ajukan pembatalan {target?.label}</DialogTitle>
          <DialogDescription>
            {target?.effect} Pembatalan baru berjalan setelah disetujui orang lain; sampai itu dokumen
            tidak berubah. Bulan yang sudah ditutup tidak berubah: pembaliknya dicatat di bulan terbuka berikutnya.
          </DialogDescription>
        </DialogHeader>
        <Field label="Alasan pembatalan" htmlFor="void-request-reason" required>
          <TextareaInput id="void-request-reason" rows={3} value={reason}
            onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: transfer ganda dari pangkalan, terlihat dua kali di mutasi BNI." />
        </Field>
        <Field label="Bukti" htmlFor="void-request-evidence" required
          hint="Mutasi rekening, tangkapan layar, atau dokumen lain (PDF, JPG, PNG, Excel; maks. 10 MB).">
          <input ref={input} id="void-request-evidence" type="file" accept={ATTACHMENT_ACCEPT} className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
              setTooBig(!!picked && picked.size > ATTACHMENT_MAX_BYTES);
              setFile(picked && picked.size <= ATTACHMENT_MAX_BYTES ? picked : null);
              e.target.value = "";
            }} />
          <div className="flex items-center gap-2">
            <Button type="button" size="sm" variant="outline" onClick={() => input.current?.click()}>
              <Upload className="h-3.5 w-3.5" /> {file ? "Ganti file" : "Pilih file"}
            </Button>
            {file && (
              <span className="flex min-w-0 items-center gap-1 text-xs text-ink">
                <FileText className="h-3.5 w-3.5 shrink-0 text-ink-muted" />
                <span className="truncate">{file.name}</span>
              </span>
            )}
          </div>
          {tooBig && <p className="mt-1 text-xs text-rust-ink">File terlalu besar; maksimal 10 MB.</p>}
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={run.isPending}>Kembali</Button>
          <Button variant="destructive" disabled={!ready} onClick={() => run.mutate(undefined as never)}>
            {run.isPending ? "Mengajukan…" : "Ajukan pembatalan"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
