/**
 * "Tagihan vendor": a bill from a vendor outside a Schedule Agreement.
 * Each line is stock (a product, valued into inventory) or an account line
 * (a repair, a uniform order -- an expense or asset account with a
 * description). Due date and the vendor's own bill number make it payable
 * and findable later (accounting parity P3).
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { getVendors } from "@/features/suppliers/api/vendorApi";
import { getProducts } from "@/features/products/api/productApi";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import { leafAccounts } from "@/features/finance/lib/accounts";
import { recordGeneralPurchase } from "@/features/purchases/api/purchaseApi";
import { useScope } from "@/features/tenancy/useScope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SegmentedControl, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { addDaysIso, todayIso } from "@/lib/date";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";

interface LineRow {
  key: number;
  kind: "product" | "account";
  productId: string;
  accountId: string;
  description: string;
  quantity: number;
  unitCost: number;
}

let lineKeySeq = 0;
function emptyLine(kind: LineRow["kind"] = "product"): LineRow {
  lineKeySeq += 1;
  return { key: lineKeySeq, kind, productId: "", accountId: "", description: "", quantity: 1, unitCost: 0 };
}

const TERMS = [0, 7, 14, 30] as const;

interface RecordPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function RecordPurchaseDialog({ open, onClose, onSaved }: RecordPurchaseDialogProps) {
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(todayIso);
  const [dueDate, setDueDate] = useState(todayIso);
  const [vendorInvoice, setVendorInvoice] = useState("");
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()]);
  const { branchId } = useScope();

  const vendors = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors, enabled: open });
  const products = useQuery({ queryKey: [...scopeKey(), "products"], queryFn: () => getProducts({ onlyActive: true }), enabled: open });
  const accounts = useQuery({ queryKey: [...scopeKey(), "chart-of-accounts"], queryFn: getChartOfAccounts, enabled: open });
  // Expense and asset leaves that no module controls -- the backend refuses
  // inventory, cash, bank and the rest on a bill line.
  const billable = leafAccounts(accounts.data ?? []).filter(
    (a) => (a.akun.tipe === "Beban" || a.akun.tipe === "Aset") && !a.akun.kontrol,
  );

  const reset = () => {
    setSupplierId("");
    setDate(todayIso());
    setDueDate(todayIso());
    setVendorInvoice("");
    setNotes("");
    setLines([emptyLine()]);
  };
  const update = (key: number, patch: Partial<LineRow>) =>
    setLines(lines.map((l) => (l.key === key ? { ...l, ...patch } : l)));

  const save = useDeskMutation({
    mutationFn: () =>
      recordGeneralPurchase({
        supplierId,
        date,
        dueDate,
        vendorInvoiceNumber: vendorInvoice,
        branchId: branchId ?? undefined,
        lines: lines.map((l) =>
          l.kind === "product"
            ? { productId: l.productId, quantity: l.quantity, unitCost: l.unitCost }
            : { accountId: l.accountId, description: l.description.trim(), quantity: l.quantity, unitCost: l.unitCost },
        ),
        notes: notes || undefined,
      }),
    success: (row) => ({ title: `${row.purchaseNumber} dicatat`, description: `Jatuh tempo ${row.dueDate}.` }),
    errorTitle: "Tagihan vendor tidak tersimpan",
    onDone: () => { onSaved(); reset(); onClose(); },
  });

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const lineOk = (l: LineRow) =>
    l.quantity > 0 && l.unitCost > 0 &&
    (l.kind === "product" ? !!l.productId : !!l.accountId && l.description.trim().length > 0);
  const canSubmit = !!supplierId && !!date && dueDate >= date && lines.length > 0 && lines.every(lineOk);

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Tagihan vendor baru</DialogTitle>
          <DialogDescription>
            Pembelian di luar Schedule Agreement: barang (masuk persediaan) atau jasa dan biaya (ke akunnya
            sendiri). Dibayar sekaligus atau bertahap dari daftar.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Vendor" htmlFor="pur-supplier" required>
              <SelectInput id="pur-supplier" value={supplierId} onChange={(e) => {
                setSupplierId(e.target.value);
                // A vendor with terms sets the due date; it stays editable.
                const terms = vendors.data?.find((v) => v.id === e.target.value)?.paymentTermsDays;
                if (terms != null) setDueDate(addDaysIso(date, terms));
              }}>
                <option value="">— Pilih —</option>
                {(vendors.data ?? []).filter((v) => v.status === "atv").map((v) => (
                  <option key={v.id} value={v.id}>{v.code} — {v.name}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="No. tagihan vendor" htmlFor="pur-vendor-invoice" hint="Nomor di nota atau invoice dari vendor.">
              <TextInput id="pur-vendor-invoice" mono maxLength={100} value={vendorInvoice}
                onChange={(e) => setVendorInvoice(e.target.value)} />
            </Field>
            <Field label="Tanggal tagihan" htmlFor="pur-date" required>
              <TextInput id="pur-date" type="date" value={date} onChange={(e) => {
                const next = e.target.value;
                // Keep the same terms when the bill date moves.
                setDueDate((due) => (due < next ? next : due));
                setDate(next);
              }} />
            </Field>
            <Field label="Jatuh tempo" htmlFor="pur-due" required
              error={dueDate < date ? "Tidak boleh sebelum tanggal tagihan" : undefined}>
              <div className="space-y-1.5">
                <TextInput id="pur-due" type="date" min={date} value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
                <div className="flex gap-1">
                  {TERMS.map((d) => (
                    <Button key={d} type="button" size="xs" variant="outline" onClick={() => setDueDate(addDaysIso(date, d))}>
                      {d === 0 ? "Tunai" : `${d} hari`}
                    </Button>
                  ))}
                </div>
              </div>
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-muted">Baris tagihan</p>
            {lines.map((line) => (
              <div key={line.key} className="space-y-2 rounded-md border border-line p-3">
                <div className="flex items-center justify-between gap-2">
                  <SegmentedControl
                    value={line.kind}
                    onChange={(kind) => update(line.key, { kind })}
                    options={[
                      { value: "product" as const, label: "Barang" },
                      { value: "account" as const, label: "Jasa / biaya" },
                    ]}
                  />
                  <Button
                    type="button" variant="ghost" size="icon-xs" aria-label="Hapus baris"
                    disabled={lines.length <= 1}
                    onClick={() => setLines(lines.filter((l) => l.key !== line.key))}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                {line.kind === "product" ? (
                  <Field label="Produk" htmlFor={`pur-line-product-${line.key}`}>
                    <SelectInput id={`pur-line-product-${line.key}`} value={line.productId}
                      onChange={(e) => update(line.key, { productId: e.target.value })}>
                      <option value="">— Pilih —</option>
                      {(products.data ?? []).map((p) => (
                        <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                      ))}
                    </SelectInput>
                  </Field>
                ) : (
                  <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                    <Field label="Akun" htmlFor={`pur-line-account-${line.key}`}>
                      <SelectInput id={`pur-line-account-${line.key}`} value={line.accountId}
                        onChange={(e) => update(line.key, { accountId: e.target.value })}>
                        <option value="">— Pilih —</option>
                        {billable.map((a) => (
                          <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label="Uraian" htmlFor={`pur-line-desc-${line.key}`}>
                      <TextInput id={`pur-line-desc-${line.key}`} maxLength={500} value={line.description}
                        onChange={(e) => update(line.key, { description: e.target.value })}
                        placeholder="Contoh: servis truk B 1234 XY" />
                    </Field>
                  </div>
                )}
                <div className="flex items-end gap-2">
                  <Field label="Qty" htmlFor={`pur-line-qty-${line.key}`} className="w-24">
                    <TextInput id={`pur-line-qty-${line.key}`} type="number" min={1} mono value={line.quantity}
                      onChange={(e) => update(line.key, { quantity: Number(e.target.value) })} />
                  </Field>
                  <Field label="Harga satuan" htmlFor={`pur-line-cost-${line.key}`} className="w-40">
                    <TextInput id={`pur-line-cost-${line.key}`} type="number" min={1} mono value={line.unitCost}
                      onChange={(e) => update(line.key, { unitCost: Number(e.target.value) })} />
                  </Field>
                  <p className="data ml-auto pb-2 text-sm text-ink">{formatRupiah(line.quantity * line.unitCost)}</p>
                </div>
              </div>
            ))}
            <div className="flex items-center justify-between">
              <div className="flex gap-2">
                <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine("product")])}>
                  <Plus className="h-3.5 w-3.5" /> Barang
                </Button>
                <Button type="button" variant="outline" size="sm" onClick={() => setLines([...lines, emptyLine("account")])}>
                  <Plus className="h-3.5 w-3.5" /> Jasa / biaya
                </Button>
              </div>
              <p className="text-xs text-ink-muted">
                Total: <span className="data font-semibold text-ink">{formatRupiah(total)}</span>
              </p>
            </div>
          </div>

          <Field label="Catatan" htmlFor="pur-notes">
            <TextareaInput id="pur-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="button" disabled={!canSubmit || save.isPending} onClick={() => save.mutate(undefined as never)}>
            Simpan tagihan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
