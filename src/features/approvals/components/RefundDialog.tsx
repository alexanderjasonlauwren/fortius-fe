/**
 * "Kembalikan dana" (client answer 5): a pangkalan that paid twice gets the
 * duplicate back. Only what is left of a verified receipt -- not allocated
 * to an invoice, not already being refunded -- can be returned, and nothing
 * moves until someone else approves it under Persetujuan; the transfer back
 * is made after that approval.
 */
import { useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileText, Upload } from "lucide-react";
import { requestRefund } from "@/features/approvals/api/approvalsApi";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, uploadAttachment } from "@/features/attachments/api/attachmentApi";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import type { PaymentView } from "@/features/finance/api/financeApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { isoDate, startOfToday } from "@/lib/date";
import { scopeKey } from "@/lib/scope";

interface RefundDialogProps {
  payment: PaymentView | null;
  onClose: () => void;
}

export function RefundDialog({ payment, onClose }: RefundDialogProps) {
  const left = Math.max(0, payment?.belumDialokasikan ?? 0);
  const [amount, setAmount] = useState("");
  const [date, setDate] = useState(() => isoDate(startOfToday()));
  const [accountId, setAccountId] = useState("");
  const [reason, setReason] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const input = useRef<HTMLInputElement>(null);

  const accounts = useQuery({
    queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts, enabled: !!payment,
  });
  // A refund leaves by transfer: bank accounts only, the default first.
  const banks = (accounts.data ?? []).filter((a) => a.aktif && a.kind !== "cash");
  const chosen = accountId || banks.find((a) => a.utama)?.id || banks[0]?.id || "";

  function reset() {
    setAmount("");
    setReason("");
    setFile(null);
    setAccountId("");
  }

  const value = amount === "" ? left : Number(amount);
  const run = useDeskMutation({
    mutationFn: async () => {
      const refund = await requestRefund({
        paymentId: payment!.id, amount: value, refundDate: date,
        bankAccountId: chosen || undefined, reason: reason.trim(),
      });
      await uploadAttachment("payment_refund", refund.id, file!);
      return refund;
    },
    errorTitle: "Pengembalian dana tidak dapat diajukan",
    success: (row) => ({
      title: `${row.refundNumber} diajukan`,
      description: `${formatRupiah(row.amount)} menunggu persetujuan; transfer kembali setelah disetujui.`,
    }),
    onDone: () => { reset(); onClose(); },
  });

  const ready = value > 0 && value <= left + 0.005 && reason.trim().length >= 3 && !!file && !!date && !run.isPending;

  return (
    <Dialog open={!!payment} onOpenChange={(o) => { if (!o) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Kembalikan dana {payment?.nomor}</DialogTitle>
          <DialogDescription>
            {payment?.outlet} · sisa yang bisa dikembalikan {formatRupiah(left)}. Dana keluar dari Hutang Titipan
            setelah disetujui orang lain; lakukan transfernya setelah itu.
          </DialogDescription>
        </DialogHeader>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Jumlah" htmlFor="refund-amount" required>
            <TextInput id="refund-amount" type="number" min={1} max={left} value={amount}
              placeholder={String(left)} onChange={(e) => setAmount(e.target.value)} />
          </Field>
          <Field label="Tanggal" htmlFor="refund-date" required>
            <TextInput id="refund-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
        </div>
        <Field label="Dari rekening" htmlFor="refund-account">
          <SelectInput id="refund-account" value={chosen} onChange={(e) => setAccountId(e.target.value)}>
            {banks.map((a) => (
              <option key={a.id} value={a.id}>{a.bank} · {a.nomorRekening}{a.atasNama ? ` · ${a.atasNama}` : ""}</option>
            ))}
          </SelectInput>
        </Field>
        <Field label="Alasan" htmlFor="refund-reason" required>
          <TextareaInput id="refund-reason" rows={2} value={reason} onChange={(e) => setReason(e.target.value)}
            placeholder="Contoh: transfer tebus 500.000 masuk dua kali dengan keterangan sama." />
        </Field>
        <Field label="Bukti" htmlFor="refund-evidence" required hint="Mutasi rekening yang menunjukkan transfer ganda.">
          <input ref={input} id="refund-evidence" type="file" accept={ATTACHMENT_ACCEPT} className="hidden"
            onChange={(e) => {
              const picked = e.target.files?.[0] ?? null;
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
        </Field>
        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={run.isPending}>Kembali</Button>
          <Button disabled={!ready} onClick={() => run.mutate(undefined as never)}>
            {run.isPending ? "Mengajukan…" : "Ajukan pengembalian"}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
