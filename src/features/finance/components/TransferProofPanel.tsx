/**
 * The bukti transfer a receipt is recorded from: upload one for the OCR engine
 * to read, or pick one already sent in (a driver's, say), watch it being read,
 * then fill the form from it. Filling is a click, not automatic -- the cashier
 * checks the values against the photo either way, and a click says when the
 * form stopped being theirs to type.
 */
import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, FileSearch, Loader2, ScanLine, Upload, X } from "lucide-react";
import { scopeKey } from "@/lib/scope";
import {
  getTransferProofs, transferProofFileUrl, uploadTransferProof, type ReceiptExtraction,
} from "@/features/ocr/api/ocrApi";
import { useOpenReceipt } from "@/features/ocr/hooks/useOpenReceipt";
import { isInFlight, MAX_RECEIPT_BYTES, RECEIPT_ACCEPT } from "@/features/ocr/lib/status";
import { isRecordable, proofNotices } from "@/features/finance/lib/transferProof";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useToast } from "@/hooks/useToast";
import { SelectInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { formatDateId, formatRupiah } from "@/lib/format";

interface Props {
  proofId?: string;
  /** The proof's latest reading; the dialog owns the query, since whether
   *  it can be recorded from decides the dialog's own submit button. */
  proof?: ReceiptExtraction;
  onProofChange: (id: string | undefined) => void;
  /** Fill the form from this proof's reading. */
  onApply: (proof: ReceiptExtraction) => void;
}

export function TransferProofPanel({ proofId, proof: row, onProofChange, onApply }: Props) {
  const fileInput = useRef<HTMLInputElement>(null);
  const { open: openFile, opening } = useOpenReceipt(transferProofFileUrl);
  const { toast } = useToast();

  const waiting = useQuery({
    queryKey: [...scopeKey(), "transfer-proofs"],
    queryFn: getTransferProofs,
    enabled: !proofId,
  });
  const send = useDeskMutation({
    mutationFn: (file: File) => uploadTransferProof(file),
    success: () => ({ title: "Bukti transfer diunggah", description: "Mesin OCR sedang membacanya." }),
    errorTitle: "Bukti transfer tidak terunggah",
    invalidate: [[...scopeKey(), "transfer-proofs"]],
    onDone: (row) => onProofChange(row.id),
  });

  const pick = (file: File | undefined) => {
    if (!file) return;
    if (file.size > MAX_RECEIPT_BYTES) {
      toast({ title: "Bukti transfer lebih dari 10 MB", description: "Unggah foto aslinya, bukan hasil kompresi yang diperbesar.", tone: "error" });
      return;
    }
    send.mutate(file);
  };

  if (!proofId) {
    const others = (waiting.data ?? []).filter(isRecordable);
    return (
      <div className="flex flex-wrap items-center gap-2 rounded-md border border-dashed border-line px-3 py-2">
        <ScanLine className="h-4 w-4 text-ink-muted" />
        <span className="text-xs text-ink-muted">Ada bukti transfer? Mesin OCR mengisi formulir dari fotonya.</span>
        <input ref={fileInput} type="file" accept={RECEIPT_ACCEPT} className="hidden" aria-label="Berkas bukti transfer"
          onChange={(e) => { pick(e.target.files?.[0]); e.target.value = ""; }} />
        <Button size="xs" variant="outline" className="ml-auto" disabled={send.isPending}
          onClick={() => fileInput.current?.click()}>
          {send.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <Upload className="h-3.5 w-3.5" />}
          Unggah bukti transfer
        </Button>
        {others.length > 0 && (
          <SelectInput aria-label="Bukti yang sudah diunggah" className="w-56 py-1 text-xs" value=""
            onChange={(e) => e.target.value && onProofChange(e.target.value)}>
            <option value="">Pilih yang sudah diunggah ({others.length})</option>
            {others.map((p) => (
              <option key={p.id} value={p.id}>
                {[p.txnDate && formatDateId(p.txnDate), p.totalAmount && formatRupiah(p.totalAmount),
                  p.transfer?.outlet?.name ?? p.fileName].filter(Boolean).join(" · ")}
              </option>
            ))}
          </SelectInput>
        )}
      </div>
    );
  }

  const reading = !row || isInFlight(row);
  const notices = row ? proofNotices(row) : [];
  return (
    <div className="space-y-2 rounded-md border border-line px-3 py-2">
      <div className="flex flex-wrap items-center gap-2 text-xs">
        <ScanLine className="h-4 w-4 text-ink-muted" />
        <span className="data truncate text-ink">{row?.fileName ?? "Bukti transfer"}</span>
        {reading ? (
          <span className="flex items-center gap-1 text-ink-muted"><Loader2 className="h-3.5 w-3.5 animate-spin" />Sedang dibaca…</span>
        ) : (
          <span className="text-ink-muted">
            {[row.totalAmount && formatRupiah(row.totalAmount), row.txnDate && formatDateId(row.txnDate),
              row.transfer?.bank, row.transfer?.outlet?.name].filter(Boolean).join(" · ") || "Tidak terbaca"}
          </span>
        )}
        <span className="ml-auto flex items-center gap-1">
          {row?.hasFile && (
            <Button size="xs" variant="ghost" disabled={opening === proofId} onClick={() => void openFile(proofId)}>
              <FileSearch className="h-3.5 w-3.5" />Lihat
            </Button>
          )}
          <Button size="xs" variant="outline" disabled={!row || !isRecordable(row)} onClick={() => row && onApply(row)}>
            Isi dari bukti
          </Button>
          <Button size="icon-xs" variant="ghost" aria-label="Lepas bukti transfer" onClick={() => onProofChange(undefined)}>
            <X className="h-3.5 w-3.5" />
          </Button>
        </span>
      </div>
      {notices.map((notice) => (
        <p key={notice.text} className={cn("flex items-start gap-2 rounded-md px-3 py-1.5 text-xs",
          notice.tone === "danger" ? "bg-rust-soft text-rust-ink" : "bg-signal-soft text-signal-ink")}>
          <AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{notice.text}
        </p>
      ))}
      {row && row.reviewReasons.length > 0 && (
        <ul className="ml-6 list-disc text-2xs text-ink-muted">
          {row.reviewReasons.map((reason) => <li key={reason}>{reason}</li>)}
        </ul>
      )}
    </div>
  );
}
