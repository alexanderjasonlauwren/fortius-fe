/**
 * Upload a receipt's photo or PDF into the review queue. A photo is read by
 * the OCR engine in the background; the values are checked, and typed where
 * the engine could not read them, when the receipt is reviewed -- not here,
 * where they would only be overwritten.
 */
import { useState } from "react";
import { uploadReceipt } from "@/features/ocr/api/ocrApi";
import type { RequestedDocumentType } from "@/features/ocr/api/contract";
import { MAX_RECEIPT_BYTES, RECEIPT_ACCEPT } from "@/features/ocr/lib/status";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SegmentedControl } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export function UploadReceiptDialog({ open, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [documentType, setDocumentType] = useState<RequestedDocumentType>("auto");
  const tooBig = !!file && file.size > MAX_RECEIPT_BYTES;

  const close = () => {
    setFile(null); setDocumentType("auto");
    onClose();
  };
  // The original file, not a downscaled copy: the engine's own guide warns
  // that recompressing a photo costs it the small print it reads totals from.
  const save = useDeskMutation({
    mutationFn: (f: File) => uploadReceipt({ file: f, documentType }),
    success: (row) => row.processStatus === "queued"
      ? { title: "Bukti diunggah", description: "Mesin OCR sedang membacanya; hasilnya muncul di antrian dalam beberapa detik." }
      : { title: "Bukti diunggah dan menunggu diperiksa" },
    errorTitle: "Bukti tidak terunggah",
    onDone: () => { onUploaded(); close(); },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); if (file && !tooBig) save.mutate(file); }}>
          <DialogHeader>
            <DialogTitle>Unggah bukti</DialogTitle>
            <DialogDescription>Foto struk, foto bukti transfer, atau PDF nota, paling besar 10 MB. Foto dibaca otomatis; isinya diperiksa sebelum disetujui.</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <Field label="Berkas" htmlFor="ocr-file" required
              error={tooBig ? "Lebih dari 10 MB. Unggah foto aslinya, jangan hasil kompresi WhatsApp yang diperbesar." : undefined}>
              <input id="ocr-file" type="file" accept={RECEIPT_ACCEPT}
                className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-xs"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Jenis bukti" htmlFor="ocr-doc-type" hint="Biarkan Otomatis kecuali hasil bacaannya keliru jenis.">
              <SegmentedControl value={documentType} onChange={setDocumentType}
                options={[
                  { value: "auto" as const, label: "Otomatis" },
                  { value: "expense_receipt" as const, label: "Struk" },
                  { value: "bank_transfer" as const, label: "Bukti transfer" },
                ]} />
            </Field>
          </div>
          <DialogFooter>
            <Button type="button" variant="outline" onClick={close}>Batal</Button>
            <Button type="submit" disabled={save.isPending || !file || tooBig}>Unggah</Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
