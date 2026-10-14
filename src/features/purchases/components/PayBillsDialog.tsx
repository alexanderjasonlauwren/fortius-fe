/**
 * "Bayar beberapa tagihan": one transfer to a vendor settling several of
 * its bills. Each bill gets its own payment document carrying the same
 * reference, recorded one after another -- if one is refused, the ones
 * before it stand and the dialog says which.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { getVendors } from "@/features/suppliers/api/vendorApi";
import { getPurchases } from "@/features/purchases/api/purchaseApi";
import { payBillsInTurn } from "@/features/purchases/lib/payBills";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useResettableState } from "@/hooks/useResettableState";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { todayIso } from "@/lib/date";
import { formatDateId, formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";
import { cn } from "@/lib/utils";

interface PayBillsDialogProps {
  open: boolean;
  onClose: () => void;
  onPaid: () => void;
}

export function PayBillsDialog({ open, onClose, onPaid }: PayBillsDialogProps) {
  const [supplierId, setSupplierId] = useState("");
  const [total, setTotal] = useState(0);
  const [paidOn, setPaidOn] = useState(todayIso);
  const [bankAccountId, setBankAccountId] = useState("");
  const [reference, setReference] = useState("");

  const vendors = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors, enabled: open });
  const accounts = useQuery({ queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts, enabled: open });
  const bills = useQuery({
    queryKey: [...scopeKey(), "purchases", "open", supplierId],
    queryFn: () => getPurchases({ paymentStatus: "open", supplierId }),
    enabled: open && !!supplierId,
  });
  const open_ = [...(bills.data ?? [])].sort((a, b) => a.dueDate.localeCompare(b.dueDate));
  const active = (accounts.data ?? []).filter((a) => a.aktif);
  const fallback = active.find((a) => a.utama && a.kind === "bank") ?? active[0];

  const [amounts, setAmounts] = useResettableState<Record<string, number>>([supplierId], () => ({}));
  const allocated = Object.values(amounts).reduce((s, v) => s + (v || 0), 0);

  /** Earliest due first -- the bill that hurts most if left unpaid. */
  const autoApply = () => {
    let budget = total;
    const next: Record<string, number> = {};
    for (const bill of open_) {
      if (budget <= 0) break;
      const take = Math.min(budget, bill.outstanding);
      next[bill.id] = Math.round(take);
      budget -= take;
    }
    setAmounts(next);
  };

  const reset = () => { setSupplierId(""); setTotal(0); setPaidOn(todayIso()); setBankAccountId(""); setReference(""); };
  const pay = useDeskMutation({
    mutationFn: () =>
      payBillsInTurn(
        open_.filter((b) => (amounts[b.id] ?? 0) > 0).map((b) => ({ purchaseId: b.id, amount: amounts[b.id] })),
        { paidOn, bankAccountId: bankAccountId || fallback?.id, bankReference: reference },
      ),
    success: (n) => ({ title: `${n} tagihan dibayar`, description: `Total ${formatRupiah(allocated)}.` }),
    errorTitle: "Pembayaran terhenti",
    onDone: () => { reset(); onPaid(); onClose(); },
    onFail: () => onPaid(),
  });

  const overAny = open_.some((b) => (amounts[b.id] ?? 0) > b.outstanding);
  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Bayar beberapa tagihan</DialogTitle>
          <DialogDescription>
            Satu transfer ke vendor untuk beberapa tagihannya. Setiap tagihan dicatat sebagai pembayarannya
            sendiri dengan referensi yang sama.
          </DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Vendor" htmlFor="pay-bills-vendor" required className="sm:col-span-2">
            <SelectInput id="pay-bills-vendor" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
              <option value="">— Pilih —</option>
              {(vendors.data ?? []).map((v) => <option key={v.id} value={v.id}>{v.code} — {v.name}</option>)}
            </SelectInput>
          </Field>
          <Field label="Jumlah transfer" htmlFor="pay-bills-total">
            <TextInput id="pay-bills-total" type="number" mono min={0} value={total}
              onChange={(e) => setTotal(Number(e.target.value))} />
          </Field>
          <Field label="Tanggal bayar" htmlFor="pay-bills-date" required>
            <TextInput id="pay-bills-date" type="date" value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
          </Field>
          <Field label="Dibayar dari" htmlFor="pay-bills-account" required>
            <SelectInput id="pay-bills-account" value={bankAccountId || fallback?.id || ""}
              onChange={(e) => setBankAccountId(e.target.value)}>
              {active.map((a) => (
                <option key={a.id} value={a.id}>{a.kind === "cash" ? "Kas" : a.bank} · {a.nomorRekening}</option>
              ))}
            </SelectInput>
          </Field>
          <Field label="No. referensi" htmlFor="pay-bills-ref">
            <TextInput id="pay-bills-ref" mono value={reference} onChange={(e) => setReference(e.target.value)} />
          </Field>
        </div>

        {supplierId && (
          <div className="space-y-2">
            <div className="flex items-center justify-between text-xs">
              <span className={cn("text-ink-muted", total > 0 && allocated !== total && "text-signal-ink")}>
                Dialokasikan <span className="data font-semibold">{formatRupiah(allocated)}</span>
                {total > 0 && <> dari <span className="data">{formatRupiah(total)}</span></>}
              </span>
              <Button size="xs" variant="outline" onClick={autoApply} disabled={total <= 0}>
                Terapkan otomatis (jatuh tempo dulu)
              </Button>
            </div>
            <div className="max-h-64 overflow-auto rounded-md border border-line">
              {open_.length === 0 ? (
                <p className="px-4 py-6 text-center text-xs text-ink-muted">Tidak ada tagihan terbuka dari vendor ini.</p>
              ) : (
                <table className="w-full text-left">
                  <tbody>
                    {open_.map((b) => (
                      <tr key={b.id} className="border-b border-line last:border-b-0">
                        <td className="px-3 py-1.5">
                          <span className="data block text-xs text-ink">{b.purchaseNumber}</span>
                          <span className="data text-2xs text-ink-muted">
                            {b.vendorInvoiceNumber ? `${b.vendorInvoiceNumber} · ` : ""}jatuh tempo {formatDateId(b.dueDate)}
                          </span>
                        </td>
                        <td className="data px-3 py-1.5 text-right text-xs text-ink">{formatRupiah(b.outstanding)}</td>
                        <td className="px-3 py-1.5 text-right">
                          <TextInput type="number" mono min={0} max={b.outstanding}
                            aria-label={`Bayar untuk ${b.purchaseNumber}`}
                            className="w-28 py-1 text-right text-xs"
                            value={amounts[b.id] ?? ""}
                            onChange={(e) => setAmounts({ ...amounts, [b.id]: Number(e.target.value) })} />
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
          </div>
        )}

        <DialogFooter>
          <Button variant="outline" onClick={() => { reset(); onClose(); }} disabled={pay.isPending}>Batal</Button>
          <Button disabled={allocated <= 0 || overAny || !fallback || !paidOn || pay.isPending}
            onClick={() => pay.mutate(undefined as never)}>
            Bayar {formatRupiah(allocated)}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
