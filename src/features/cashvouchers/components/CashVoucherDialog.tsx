/**
 * Kas masuk, kas keluar, or a transfer between two of the tenant's own
 * accounts. One dialog for create AND for editing an existing draft --
 * voucher_type is immutable once created (mirrors the backend: Update has
 * no voucher_type field at all), so editing locks the segmented control
 * rather than hiding it, the same reasoning BankSection's own Kind field
 * follows. Financial-statements plan's gap-closing phase, Phase B.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import {
  createCashVoucher,
  updateCashVoucher,
  type CashVoucher,
  type CashVoucherLineInput,
  type CashVoucherType,
} from "@/features/cashvouchers/api/cashVoucherApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SegmentedControl, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/mocks/scope";

/** Account codes the quick templates pre-select -- confirmed to exist on
 *  both the real chart (tenantprovisioning/chart.go) and the mock's own
 *  (mocks/ledger.ts), so the suggestion is never a dead pick. */
const QUICK_TEMPLATES: {
  label: string;
  voucherType: CashVoucherType;
  accountCode?: string;
  counterparty: string;
} [] = [
  { label: "Jasa giro", voucherType: "receipt", accountCode: "4-3100", counterparty: "Jasa giro bank" },
  { label: "Biaya admin bank", voucherType: "disbursement", accountCode: "5-6100", counterparty: "Administrasi bank" },
  { label: "Pengisian kas kecil", voucherType: "transfer", counterparty: "Pengisian kas kecil" },
];

interface LineRow extends CashVoucherLineInput {
  key: number;
}

let lineKeySeq = 0;
function emptyLine(accountId = ""): LineRow {
  lineKeySeq += 1;
  return { key: lineKeySeq, accountId, amount: 0, memo: undefined };
}

interface CashVoucherDialogProps {
  open: boolean;
  onClose: () => void;
  /** Present when editing an existing draft; absent when creating. */
  voucher?: CashVoucher | null;
  onSaved: () => void;
}

export function CashVoucherDialog({ open, onClose, voucher, onSaved }: CashVoucherDialogProps) {
  const editing = !!voucher;
  // Lazy initial state read straight from `voucher`, not an effect that
  // copies it in after mount -- the caller remounts this component (via a
  // `key` keyed on the voucher's own id, or "new") every time a different
  // voucher or a fresh create is opened, so each mount's initial state is
  // already right. See CashBankPage.tsx's own `key` for why that holds.
  const [voucherType, setVoucherType] = useState<CashVoucherType>(voucher?.voucherType ?? "receipt");
  const [voucherDate, setVoucherDate] = useState(voucher?.voucherDate ?? (() => new Date().toISOString().slice(0, 10))());
  const [bankAccountId, setBankAccountId] = useState(voucher?.bankAccountId ?? "");
  const [counterBankAccountId, setCounterBankAccountId] = useState(voucher?.counterBankAccountId ?? "");
  const [counterparty, setCounterparty] = useState(voucher?.counterparty ?? "");
  const [description, setDescription] = useState(voucher?.description ?? "");
  const [amount, setAmount] = useState(voucher?.totalAmount ?? 0);
  const [lines, setLines] = useState<LineRow[]>(() =>
    voucher?.lines.length
      ? voucher.lines.map((l) => ({ key: (lineKeySeq += 1), accountId: l.accountId, amount: l.amount, memo: l.memo }))
      : [emptyLine()],
  );

  const bankAccounts = useQuery({ queryKey: [...scopeKey(), "cash-bank", "bank-accounts"], queryFn: getBankAccounts, enabled: open });
  const accounts = useQuery({ queryKey: [...scopeKey(), "cash-bank", "chart-of-accounts"], queryFn: getChartOfAccounts, enabled: open });

  const save = useDeskMutation({
    mutationFn: () => {
      const payload = {
        voucherType,
        voucherDate,
        bankAccountId,
        counterBankAccountId: voucherType === "transfer" ? counterBankAccountId : undefined,
        counterparty: counterparty || undefined,
        description: description || undefined,
        amount: voucherType === "transfer" ? amount : undefined,
        lines: voucherType === "transfer" ? undefined : lines.map(({ accountId, amount: a, memo }) => ({ accountId, amount: a, memo })),
      };
      return voucher
        ? updateCashVoucher({ id: voucher.id, version: voucher.version, ...payload })
        : createCashVoucher(payload);
    },
    success: (row) => ({ title: `${row.voucherNumber} disimpan sebagai draft` }),
    errorTitle: "Voucher tidak tersimpan",
    onDone: () => { onSaved(); onClose(); },
  });

  function applyTemplate(template: (typeof QUICK_TEMPLATES)[number]) {
    setVoucherType(template.voucherType);
    setCounterparty(template.counterparty);
    const account = template.accountCode
      ? accounts.data?.find((a) => a.akun.kode === template.accountCode)?.akun
      : undefined;
    if (account) setLines([emptyLine(account.id)]);
  }

  const totalLines = lines.reduce((sum, l) => sum + (l.amount || 0), 0);
  const canSubmit =
    !!voucherDate && !!bankAccountId &&
    (voucherType === "transfer"
      ? !!counterBankAccountId && counterBankAccountId !== bankAccountId && amount > 0
      : lines.length > 0 && lines.every((l) => l.accountId && l.amount > 0));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>{editing ? `Ubah ${voucher?.voucherNumber}` : "Voucher kas/bank baru"}</DialogTitle>
          <DialogDescription>
            Tersimpan sebagai draft -- posting menulis jurnal dan tidak dapat diedit lagi.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Jenis" htmlFor="cv-type">
            {editing ? (
              <p className="py-1.5 text-sm text-ink">
                {voucherType === "receipt" ? "Kas masuk" : voucherType === "disbursement" ? "Kas keluar" : "Transfer"}
              </p>
            ) : (
              <SegmentedControl
                value={voucherType}
                onChange={(v) => { setVoucherType(v); setLines([emptyLine()]); }}
                options={[
                  { value: "receipt" as const, label: "Kas masuk" },
                  { value: "disbursement" as const, label: "Kas keluar" },
                  { value: "transfer" as const, label: "Transfer" },
                ]}
              />
            )}
          </Field>

          {!editing && (
            <div className="flex flex-wrap gap-2">
              {QUICK_TEMPLATES.map((t) => (
                <Button key={t.label} type="button" variant="outline" size="sm" onClick={() => applyTemplate(t)}>
                  {t.label}
                </Button>
              ))}
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <Field label="Tanggal" htmlFor="cv-date" required>
              <TextInput id="cv-date" type="date" value={voucherDate} onChange={(e) => setVoucherDate(e.target.value)} />
            </Field>
            <Field label={voucherType === "transfer" ? "Dari akun" : "Akun kas/bank"} htmlFor="cv-bank" required>
              <SelectInput id="cv-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">— Pilih —</option>
                {(bankAccounts.data ?? []).map((a) => (
                  <option key={a.id} value={a.id}>
                    {a.kind === "cash" ? "Kas" : a.bank} {a.nomorRekening}
                  </option>
                ))}
              </SelectInput>
            </Field>
          </div>

          {voucherType === "transfer" ? (
            <div className="grid grid-cols-2 gap-4">
              <Field label="Ke akun" htmlFor="cv-counter" required>
                <SelectInput id="cv-counter" value={counterBankAccountId} onChange={(e) => setCounterBankAccountId(e.target.value)}>
                  <option value="">— Pilih —</option>
                  {(bankAccounts.data ?? []).filter((a) => a.id !== bankAccountId).map((a) => (
                    <option key={a.id} value={a.id}>
                      {a.kind === "cash" ? "Kas" : a.bank} {a.nomorRekening}
                    </option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Nilai" htmlFor="cv-amount" required>
                <TextInput id="cv-amount" type="number" min={1} mono value={amount} onChange={(e) => setAmount(Number(e.target.value))} />
              </Field>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-muted">Baris akun</p>
              {lines.map((line, i) => (
                <div key={line.key} className="flex items-end gap-2">
                  <Field label={i === 0 ? "Akun" : undefined} htmlFor={`cv-line-account-${line.key}`} className="flex-1">
                    <SelectInput
                      id={`cv-line-account-${line.key}`}
                      value={line.accountId}
                      onChange={(e) => setLines(lines.map((l) => (l.key === line.key ? { ...l, accountId: e.target.value } : l)))}
                    >
                      <option value="">— Pilih —</option>
                      {(accounts.data ?? []).map((a) => (
                        <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                  <Field label={i === 0 ? "Nilai" : undefined} htmlFor={`cv-line-amount-${line.key}`} className="w-40">
                    <TextInput
                      id={`cv-line-amount-${line.key}`}
                      type="number" min={1} mono
                      value={line.amount}
                      onChange={(e) => setLines(lines.map((l) => (l.key === line.key ? { ...l, amount: Number(e.target.value) } : l)))}
                    />
                  </Field>
                  <Button
                    type="button" variant="ghost" size="icon-xs"
                    aria-label="Hapus baris"
                    disabled={lines.length <= 1}
                    onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine()])}>
                  <Plus className="h-3.5 w-3.5" />
                  Tambah baris
                </Button>
                <p className="text-xs text-ink-muted">
                  Total: <span className="data font-semibold text-ink">{formatRupiah(totalLines)}</span>
                </p>
              </div>
            </div>
          )}

          <Field label="Pihak terkait" htmlFor="cv-counterparty" hint="Nama bank, penyedia jasa, atau pihak lain.">
            <TextInput id="cv-counterparty" value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
          </Field>
          <Field label="Catatan" htmlFor="cv-description">
            <TextareaInput id="cv-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={save.isPending}>Batal</Button>
          <Button type="button" disabled={!canSubmit || save.isPending} onClick={() => save.mutate(undefined as never)}>
            {save.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Simpan draft
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
