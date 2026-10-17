/**
 * Saldo awal persediaan: the quantity and unit cost of what was on hand when
 * the books started, for products that have not moved yet. No journal --
 * the value is what Saldo Awal already put in Persediaan; Ringkasan
 * Persediaan shows whether the two agree (accounting parity P7).
 */
import { useState } from "react";
import { recordOpeningStock, type StockRow } from "@/features/inventory/api/inventoryApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { todayIso } from "@/features/financereports/lib/period";

export function OpeningStockDialog({ open, stock, onClose }: { open: boolean; stock: StockRow[]; onClose: () => void }) {
  const [date, setDate] = useState(() => todayIso().slice(0, 8) + "01");
  const [rows, setRows] = useState<Record<string, { quantity: string; unitCost: string }>>({});
  const products = stock.filter((s) => !s.opened);

  const lines = products
    .map((p) => ({ product: p, input: rows[p.productId] }))
    .filter(({ input }) => input && Number(input.quantity) > 0)
    .map(({ product, input }) => ({ productId: product.productId, quantity: Number(input.quantity), unitCost: Number(input.unitCost || 0) }));
  const total = lines.reduce((sum, l) => sum + l.quantity * l.unitCost, 0);

  const save = useDeskMutation({
    mutationFn: () => recordOpeningStock({ date, lines }),
    errorTitle: "Saldo awal persediaan gagal disimpan",
    success: `Saldo awal persediaan disimpan`,
    onDone: onClose,
  });

  const set = (id: string, key: "quantity" | "unitCost", value: string) =>
    setRows({ ...rows, [id]: { quantity: rows[id]?.quantity ?? "", unitCost: rows[id]?.unitCost ?? "", [key]: value } });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Saldo awal persediaan</DialogTitle>
          <DialogDescription>
            Jumlah dan harga pokok per produk saat mulai memakai sistem. Tidak dijurnal: nilainya sudah masuk lewat Saldo Awal
            akun Persediaan. Hanya untuk produk yang belum punya mutasi.
          </DialogDescription>
        </DialogHeader>
        <Field label="Per tanggal" htmlFor="os-date" required>
          <TextInput id="os-date" type="date" className="w-44" value={date} onChange={(e) => setDate(e.target.value)} />
        </Field>
        {products.length === 0 ? (
          <p className="text-sm text-ink-muted">Semua produk sudah punya stok. Koreksi jumlahnya lewat stok opname.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2 text-left font-semibold">Produk</th>
                  <th className="py-2 text-right font-semibold">Jumlah</th>
                  <th className="py-2 text-right font-semibold">Harga pokok / unit</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.productId} className="border-b border-line">
                    <td className="py-2 text-ink"><span className="data text-xs text-ink-muted">{p.code}</span> {p.name}</td>
                    <td className="py-2 text-right">
                      <TextInput aria-label={`Jumlah ${p.name}`} type="number" min={0} mono className="ml-auto w-24 py-1 text-right"
                        value={rows[p.productId]?.quantity ?? ""} onChange={(e) => set(p.productId, "quantity", e.target.value)} />
                    </td>
                    <td className="py-2 text-right">
                      {p.kind === "container" ? (
                        <span className="text-2xs text-ink-muted">jumlah saja</span>
                      ) : (
                        <TextInput aria-label={`Harga pokok ${p.name}`} type="number" min={0} mono className="ml-auto w-32 py-1 text-right"
                          value={rows[p.productId]?.unitCost ?? ""} onChange={(e) => set(p.productId, "unitCost", e.target.value)} />
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <p className="text-xs text-ink-muted">Nilai yang dicatat: <span className="data font-semibold text-ink">{formatRupiah(total)}</span></p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={lines.length === 0 || !date || save.isPending} onClick={() => save.mutate(undefined as never)}>
            Simpan saldo awal
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
