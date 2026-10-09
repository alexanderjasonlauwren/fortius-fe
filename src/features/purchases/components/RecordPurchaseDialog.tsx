/**
 * Records a general purchase -- no Schedule Agreement behind it, a local
 * vendor paid directly (gap-closing plan, Phase F). No branch picker: see
 * RecordGeneralPurchaseInput's own doc for why both adapters resolve the
 * tenant's default branch themselves.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { getVendors } from "@/features/suppliers/api/vendorApi";
import { getProducts } from "@/features/products/api/productApi";
import { recordGeneralPurchase } from "@/features/purchases/api/purchaseApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/mocks/scope";

interface LineRow {
  key: number;
  productId: string;
  quantity: number;
  unitCost: number;
}

let lineKeySeq = 0;
function emptyLine(): LineRow {
  lineKeySeq += 1;
  return { key: lineKeySeq, productId: "", quantity: 1, unitCost: 0 };
}

interface RecordPurchaseDialogProps {
  open: boolean;
  onClose: () => void;
  onSaved: () => void;
}

export function RecordPurchaseDialog({ open, onClose, onSaved }: RecordPurchaseDialogProps) {
  const [supplierId, setSupplierId] = useState("");
  const [date, setDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [notes, setNotes] = useState("");
  const [lines, setLines] = useState<LineRow[]>(() => [emptyLine()]);

  const vendors = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors, enabled: open });
  const products = useQuery({ queryKey: [...scopeKey(), "products"], queryFn: () => getProducts({ onlyActive: true }), enabled: open });

  const reset = () => {
    setSupplierId("");
    setDate(new Date().toISOString().slice(0, 10));
    setNotes("");
    setLines([emptyLine()]);
  };

  const save = useDeskMutation({
    mutationFn: () =>
      recordGeneralPurchase({
        supplierId,
        date,
        lines: lines.map(({ productId, quantity, unitCost }) => ({ productId, quantity, unitCost })),
        notes: notes || undefined,
      }),
    success: (row) => ({ title: `${row.purchaseNumber} dicatat` }),
    errorTitle: "Pembelian tidak tersimpan",
    onDone: () => { onSaved(); reset(); onClose(); },
  });

  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);
  const canSubmit =
    !!supplierId && !!date &&
    lines.length > 0 && lines.every((l) => l.productId && l.quantity > 0 && l.unitCost > 0);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) { reset(); onClose(); }
      }}
    >
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Pembelian umum baru</DialogTitle>
          <DialogDescription>
            Di luar Schedule Agreement -- untuk vendor lokal seperti timbangan atau ATK.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Field label="Vendor" htmlFor="pur-supplier" required>
              <SelectInput id="pur-supplier" value={supplierId} onChange={(e) => setSupplierId(e.target.value)}>
                <option value="">— Pilih —</option>
                {(vendors.data ?? []).filter((v) => v.status === "atv").map((v) => (
                  <option key={v.id} value={v.id}>{v.code} — {v.name}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Tanggal" htmlFor="pur-date" required>
              <TextInput id="pur-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-muted">Baris pembelian</p>
            {lines.map((line, i) => (
              <div key={line.key} className="flex items-end gap-2">
                <Field label={i === 0 ? "Produk" : undefined} htmlFor={`pur-line-product-${line.key}`} className="flex-1">
                  <SelectInput
                    id={`pur-line-product-${line.key}`}
                    value={line.productId}
                    onChange={(e) => setLines(lines.map((l) => (l.key === line.key ? { ...l, productId: e.target.value } : l)))}
                  >
                    <option value="">— Pilih —</option>
                    {(products.data ?? []).map((p) => (
                      <option key={p.id} value={p.id}>{p.kode} — {p.nama}</option>
                    ))}
                  </SelectInput>
                </Field>
                <Field label={i === 0 ? "Qty" : undefined} htmlFor={`pur-line-qty-${line.key}`} className="w-24">
                  <TextInput
                    id={`pur-line-qty-${line.key}`}
                    type="number" min={1} mono
                    value={line.quantity}
                    onChange={(e) => setLines(lines.map((l) => (l.key === line.key ? { ...l, quantity: Number(e.target.value) } : l)))}
                  />
                </Field>
                <Field label={i === 0 ? "Harga satuan" : undefined} htmlFor={`pur-line-cost-${line.key}`} className="w-36">
                  <TextInput
                    id={`pur-line-cost-${line.key}`}
                    type="number" min={1} mono
                    value={line.unitCost}
                    onChange={(e) => setLines(lines.map((l) => (l.key === line.key ? { ...l, unitCost: Number(e.target.value) } : l)))}
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
            Simpan pembelian
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
