/**
 * Kas masuk, kas keluar, or a transfer between two of the tenant's own
 * accounts. One dialog for create AND for editing an existing draft --
 * voucher_type is immutable once created (mirrors the backend: Update has
 * no voucher_type field at all), so editing locks the segmented control
 * rather than hiding it, the same reasoning BankSection's own Kind field
 * follows. Financial-statements plan's gap-closing phase, Phase B.
 *
 * Accounting parity P3: a reference number, a contact (vendor or
 * pangkalan), a memo per line, and "duplicate" -- a new draft pre-filled
 * from an existing voucher, dated today.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import { getVendors } from "@/features/suppliers/api/vendorApi";
import { getOutletOptions } from "@/features/distribution/api/distributionApi";
import { useScope } from "@/features/tenancy/useScope";
import { contactValue, parseContact } from "@/features/cashvouchers/lib/contact";
import { todayIso } from "@/lib/date";
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
import { leafAccounts } from "@/features/finance/lib/accounts";
import { scopeKey } from "@/lib/scope";

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
  /** Pre-fills a NEW draft from this voucher (duplicate), dated today. */
  template?: CashVoucher | null;
  onSaved: () => void;
}

export function CashVoucherDialog({ open, onClose, voucher, template, onSaved }: CashVoucherDialogProps) {
  const editing = !!voucher;
  const source = voucher ?? template;
  const { branchId } = useScope();
  // Lazy initial state read straight from `voucher`, not an effect that
  // copies it in after mount -- the caller remounts this component (via a
  // `key` keyed on the voucher's own id, or "new") every time a different
  // voucher or a fresh create is opened, so each mount's initial state is
  // already right. See CashBankPage.tsx's own `key` for why that holds.
  const [voucherType, setVoucherType] = useState<CashVoucherType>(source?.voucherType ?? "receipt");
  // A duplicate is today's movement, not a copy of the old date.
  const [voucherDate, setVoucherDate] = useState(voucher?.voucherDate ?? todayIso());
  const [bankAccountId, setBankAccountId] = useState(source?.bankAccountId ?? "");
  const [counterBankAccountId, setCounterBankAccountId] = useState(source?.counterBankAccountId ?? "");
  const [counterparty, setCounterparty] = useState(source?.counterparty ?? "");
  const [contact, setContact] = useState(source ? contactValue(source) : "");
  // A duplicate never carries the old slip number: each movement has its own.
  const [referenceNumber, setReferenceNumber] = useState(voucher?.referenceNumber ?? "");
  const [description, setDescription] = useState(source?.description ?? "");
  const [amount, setAmount] = useState(source?.totalAmount ?? 0);
  const [lines, setLines] = useState<LineRow[]>(() =>
    source?.lines.length
      ? source.lines.map((l) => ({ key: (lineKeySeq += 1), accountId: l.accountId, amount: l.amount, memo: l.memo }))
      : [emptyLine()],
  );

  const bankAccounts = useQuery({ queryKey: [...scopeKey(), "cash-bank", "bank-accounts"], queryFn: getBankAccounts, enabled: open });
  const accounts = useQuery({ queryKey: [...scopeKey(), "cash-bank", "chart-of-accounts"], queryFn: getChartOfAccounts, enabled: open });
  const vendors = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors, enabled: open });
  const outlets = useQuery({ queryKey: [...scopeKey(), "outlet-options"], queryFn: getOutletOptions, enabled: open });
  // ledger.Post refuses a line posted to a grouping header ("Akun %s
  // adalah akun induk; posting harus ke sub-akun"), caught live posting a
  // manual journal to one (gap-closing plan, Phase E) -- the same chart,
  // so a voucher's own line picker excludes parents too.
  // A control account (receivable, payable, inventory, cash/bank...) is
  // refused on a voucher line by the backend; do not offer it.
  const postableAccounts = leafAccounts(accounts.data ?? []).filter((a) => !a.akun.kontrol);

  const save = useDeskMutation({
    mutationFn: () => {
      const payload = {
        ...parseContact(contact),
        referenceNumber,
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
        // A new voucher is booked in the branch the console is scoped to;
        // consolidated leaves it to the backend's default branch.
        : createCashVoucher({ ...payload, branchId: branchId ?? undefined });
    },
    success: (row) => ({ title: `${row.voucherNumber} disimpan sebagai draft` }),
    errorTitle: "Voucher tidak tersimpan",
    onDone: () => { onSaved(); onClose(); },
  });

  function applyTemplate(quick: (typeof QUICK_TEMPLATES)[number]) {
    setVoucherType(quick.voucherType);
    setCounterparty(quick.counterparty);
    const account = quick.accountCode
      ? accounts.data?.find((a) => a.akun.kode === quick.accountCode)?.akun
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
          <DialogTitle>
            {editing ? `Ubah ${voucher?.voucherNumber}` : template ? `Duplikat ${template.voucherNumber}` : "Voucher kas/bank baru"}
          </DialogTitle>
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

          {!editing && !template && (
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
            <Field label="No. referensi" htmlFor="cv-ref" hint="No. slip, transfer, atau kuitansi.">
              <TextInput id="cv-ref" mono maxLength={100} value={referenceNumber} onChange={(e) => setReferenceNumber(e.target.value)} />
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
                <div key={line.key} className="space-y-1">
                <div className="flex items-end gap-2">
                  <Field label={i === 0 ? "Akun" : undefined} htmlFor={`cv-line-account-${line.key}`} className="flex-1">
                    <SelectInput
                      id={`cv-line-account-${line.key}`}
                      value={line.accountId}
                      onChange={(e) => setLines(lines.map((l) => (l.key === line.key ? { ...l, accountId: e.target.value } : l)))}
                    >
                      <option value="">— Pilih —</option>
                      {postableAccounts.map((a) => (
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
                <TextInput
                  aria-label={`Keterangan baris ${i + 1}`}
                  placeholder="Keterangan baris (opsional)"
                  maxLength={200}
                  className="py-1 text-xs"
                  value={line.memo ?? ""}
                  onChange={(e) => setLines(lines.map((l) => (l.key === line.key ? { ...l, memo: e.target.value } : l)))}
                />
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

          <div className="grid grid-cols-2 gap-4">
            <Field label="Kontak" htmlFor="cv-contact" hint="Vendor atau pangkalan, bila ada.">
              <SelectInput id="cv-contact" value={contact} onChange={(e) => setContact(e.target.value)}>
                <option value="">— Tidak ada —</option>
                <optgroup label="Vendor">
                  {(vendors.data ?? []).filter((v) => v.status === "atv" || contact === `s:${v.id}`).map((v) => (
                    <option key={v.id} value={`s:${v.id}`}>{v.name}</option>
                  ))}
                </optgroup>
                <optgroup label="Pangkalan">
                  {(outlets.data ?? []).map((o) => <option key={o.id} value={`o:${o.id}`}>{o.label}</option>)}
                </optgroup>
              </SelectInput>
            </Field>
            <Field label="Pihak lain" htmlFor="cv-counterparty" hint="Bank, penyedia jasa, atau pihak tanpa kontak.">
              <TextInput id="cv-counterparty" maxLength={200} value={counterparty} onChange={(e) => setCounterparty(e.target.value)} />
            </Field>
          </div>
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
