/**
 * Upload a receipt's photo or PDF with what can be read off it, into the
 * review queue (accounting parity P3: the file is stored, not just named).
 */
import { useState } from "react";
import { uploadReceipt } from "@/features/ocr/api/ocrApi";
import { MAX_RECEIPT_BYTES, RECEIPT_ACCEPT } from "@/features/ocr/lib/status";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { todayIso } from "@/lib/date";

interface Props {
  open: boolean;
  onClose: () => void;
  onUploaded: () => void;
}

export function UploadReceiptDialog({ open, onClose, onUploaded }: Props) {
  const [file, setFile] = useState<File | null>(null);
  const [merchantName, setMerchantName] = useState("");
  const [txnDate, setTxnDate] = useState(todayIso());
  const [totalAmount, setTotalAmount] = useState(0);
  const tooBig = !!file && file.size > MAX_RECEIPT_BYTES;

  const close = () => {
    setFile(null); setMerchantName(""); setTxnDate(todayIso()); setTotalAmount(0);
    onClose();
  };
  const save = useDeskMutation({
    mutationFn: (f: File) => uploadReceipt({ file: f, merchantName, txnDate, totalAmount: totalAmount || undefined }),
    success: "Bukti diunggah dan menunggu diperiksa",
    errorTitle: "Bukti tidak terunggah",
    onDone: () => { onUploaded(); close(); },
  });

  return (
    <Dialog open={open} onOpenChange={(o) => !o && close()}>
      <DialogContent>
        <form onSubmit={(e) => { e.preventDefault(); if (file && !tooBig) save.mutate(file); }}>
          <DialogHeader>
            <DialogTitle>Unggah bukti pengeluaran</DialogTitle>
            <DialogDescription>Foto struk atau PDF nota, paling besar 10 MB. Isi yang terbaca supaya pemeriksa tidak perlu mengetik ulang.</DialogDescription>
          </DialogHeader>
          <div className="grid grid-cols-2 gap-4 py-4">
            <Field className="col-span-2" label="Berkas" htmlFor="ocr-file" required
              error={tooBig ? "Lebih dari 10 MB. Perkecil fotonya." : undefined}>
              <input id="ocr-file" type="file" accept={RECEIPT_ACCEPT}
                className="block w-full text-sm text-ink file:mr-3 file:rounded-md file:border file:border-line file:bg-paper file:px-3 file:py-1.5 file:text-xs"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Merchant" htmlFor="ocr-merchant">
              <TextInput id="ocr-merchant" maxLength={255} value={merchantName} onChange={(e) => setMerchantName(e.target.value)} placeholder="SPBU 44.501.02" />
            </Field>
            <Field label="Tanggal nota" htmlFor="ocr-date">
              <TextInput id="ocr-date" type="date" value={txnDate} onChange={(e) => setTxnDate(e.target.value)} />
            </Field>
            <Field className="col-span-2" label="Nilai" htmlFor="ocr-total">
              <TextInput id="ocr-total" type="number" min={0} step="any" mono value={totalAmount || ""}
                onChange={(e) => setTotalAmount(Number(e.target.value))} />
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
