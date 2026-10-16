/**
 * Stok opname: what was physically counted of each product, as of a date.
 * Each difference from the books is valued at the average that day and
 * posted against Selisih Persediaan (accounting parity P7). A product left
 * blank is not counted.
 */
import { useState } from "react";
import { createStockCount, type StockRow } from "@/features/inventory/api/inventoryApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, TextInput, TextareaInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatNumber, formatRupiah } from "@/lib/format";
import { todayIso } from "@/features/financereports/lib/period";

export function StockCountDialog({ open, stock, onClose }: { open: boolean; stock: StockRow[]; onClose: () => void }) {
  const [date, setDate] = useState(todayIso);
  const [notes, setNotes] = useState("");
  const [counted, setCounted] = useState<Record<string, string>>({});
  const products = stock.filter((s) => s.opened);

  const lines = products
    .filter((p) => counted[p.productId] !== undefined && counted[p.productId] !== "")
    .map((p) => ({ productId: p.productId, countedQuantity: Number(counted[p.productId]) }));

  const save = useDeskMutation({
    mutationFn: () => createStockCount({ date, notes, lines }),
    errorTitle: "Stok opname gagal disimpan",
    success: (result) => ({
      title: `Stok opname ${result.number} disimpan`,
      description: result.totalAmount === 0 ? "Tidak ada selisih." : `Selisih ${formatRupiah(result.totalAmount)} dijurnal ke Selisih Persediaan.`,
    }),
    onDone: onClose,
  });

  return (
    <Dialog open={open} onOpenChange={(next) => !next && onClose()}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Stok opname</DialogTitle>
          <DialogDescription>
            Isi jumlah fisik yang dihitung. Selisih dengan buku dinilai dengan harga rata-rata pada tanggal opname dan dijurnal ke
            Selisih Persediaan. Produk yang dikosongkan tidak dihitung.
          </DialogDescription>
        </DialogHeader>
        <div className="grid gap-3 sm:grid-cols-2">
          <Field label="Tanggal opname" htmlFor="sc-date" required>
            <TextInput id="sc-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Catatan" htmlFor="sc-notes">
            <TextareaInput id="sc-notes" rows={1} value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
        {products.length === 0 ? (
          <p className="text-sm text-ink-muted">Belum ada produk dengan stok. Catat saldo awal persediaan atau pembelian lebih dahulu.</p>
        ) : (
          <div className="max-h-80 overflow-y-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-line text-2xs uppercase tracking-wide text-ink-muted">
                  <th className="py-2 text-left font-semibold">Produk</th>
                  <th className="py-2 text-right font-semibold">Di buku (saat ini)</th>
                  <th className="py-2 text-right font-semibold">Dihitung</th>
                </tr>
              </thead>
              <tbody>
                {products.map((p) => (
                  <tr key={p.productId} className="border-b border-line">
                    <td className="py-2 text-ink">
                      <span className="data text-xs text-ink-muted">{p.code}</span> {p.name}
                    </td>
                    <td className="data py-2 text-right text-ink-muted">{formatNumber(p.quantity)}</td>
                    <td className="py-2 text-right">
                      <TextInput
                        aria-label={`Jumlah dihitung ${p.name}`}
                        type="number" min={0} mono className="ml-auto w-28 py-1 text-right"
                        value={counted[p.productId] ?? ""}
                        onChange={(e) => setCounted({ ...counted, [p.productId]: e.target.value })}
                      />
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>Batal</Button>
          <Button disabled={lines.length === 0 || !date || save.isPending} onClick={() => save.mutate(undefined as never)}>
            Simpan opname
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
