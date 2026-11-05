/**
 * Penyesuaian persediaan: a value-only stock opname.
 *
 * For an inventory asset account that holds no product stock -- supplies,
 * packaging, anything carried at a value rather than per product. The user
 * enters what each account was counted at; the server posts the difference
 * from the ledger against Selisih Persediaan. An account products are stocked
 * on is refused (USE_STOCK_COUNT): those are counted per product on the
 * inventory page, or the stock ledger and the books would disagree.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Plus, Trash2 } from "lucide-react";
import { getChartOfAccounts, postInventoryAdjustment } from "@/features/finance/api/financeApi";
import { leafAccounts } from "@/features/finance/lib/accounts";
import { todayIso } from "@/lib/date";
import { formatRupiah } from "@/lib/format";
import { scopeKey } from "@/lib/scope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

interface Row {
  accountId: string;
  counted: string;
}

const emptyRow = (): Row => ({ accountId: "", counted: "" });

export function InventoryAdjustmentDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [date, setDate] = useState(todayIso);
  const [description, setDescription] = useState("");
  const [rows, setRows] = useState<Row[]>([emptyRow()]);

  const accounts = useQuery({
    queryKey: [...scopeKey(), "manual-journal", "accounts"],
    queryFn: getChartOfAccounts,
    enabled: open,
  });
  // The inventory block of the chart: leaves sharing the stock account's code
  // block (1-13xx: Persediaan Tabung, and the perlengkapan accounts under
  // 1-1310), minus the stock account itself. No role marks the block, and the
  // server would take any asset -- a "count" of Kas or Piutang included --
  // so the picker narrows to what the screen is for. Whether products are
  // stocked on an account is still the server's to say (USE_STOCK_COUNT).
  const all = accounts.data ?? [];
  const stockAccount = all.find((a) => a.akun.role === "persediaan");
  const block = stockAccount?.akun.kode.slice(0, 4);
  const eligible = leafAccounts(all).filter(
    (a) =>
      a.akun.tipe === "Aset" &&
      a.akun.role !== "persediaan" &&
      !!block &&
      a.akun.kode.startsWith(block),
  );
  const balanceOf = (accountId: string) => eligible.find((a) => a.akun.id === accountId)?.saldo;

  const filled = rows.filter((r) => r.accountId && r.counted.trim() !== "" && Number(r.counted) >= 0);
  const canSubmit = !!date && filled.length > 0 && filled.length === rows.filter((r) => r.accountId).length;

  const reset = () => {
    setDate(todayIso());
    setDescription("");
    setRows([emptyRow()]);
  };
  const close = () => {
    reset();
    onClose();
  };

  const post = useDeskMutation({
    mutationFn: () =>
      postInventoryAdjustment({
        date,
        description,
        lines: filled.map((r) => ({ accountId: r.accountId, countedValue: Number(r.counted) })),
      }),
    errorTitle: "Penyesuaian tidak diposting",
    success: (result) => ({
      title: "Penyesuaian diposting",
      description: `Selisih ${formatRupiah(result.totalAdjustment)} dicatat ke Selisih Persediaan.`,
    }),
    onDone: close,
  });

  const setRow = (index: number, patch: Partial<Row>) =>
    setRows((current) => current.map((r, i) => (i === index ? { ...r, ...patch } : r)));

  return (
    <Dialog open={open} onOpenChange={(o) => !o && !post.isPending && close()}>
      <DialogContent className="sm:max-w-xl">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            if (canSubmit) post.mutate(undefined as never);
          }}
        >
          <DialogHeader>
            <DialogTitle>Penyesuaian persediaan</DialogTitle>
            <DialogDescription>
              Untuk akun persediaan yang tidak memegang stok produk. Isi nilai hasil hitung; selisihnya
              dengan buku besar diposting ke Selisih Persediaan. Stok produk dihitung per produk di
              menu Persediaan.
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Tanggal hitung" htmlFor="adj-date" required>
                <TextInput id="adj-date" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
              </Field>
              <Field label="Keterangan" htmlFor="adj-desc">
                <TextInput id="adj-desc" value={description} onChange={(e) => setDescription(e.target.value)} />
              </Field>
            </div>

            <div className="space-y-2">
              {rows.map((row, index) => {
                const balance = balanceOf(row.accountId);
                return (
                  <div key={index} className="grid grid-cols-[1fr_10rem_auto] items-end gap-2">
                    <Field
                      label={index === 0 ? "Akun" : undefined}
                      htmlFor={`adj-account-${index}`}
                      hint={balance !== undefined ? `Saldo buku saat ini ${formatRupiah(balance)}` : undefined}
                    >
                      <SelectInput
                        id={`adj-account-${index}`}
                        value={row.accountId}
                        onChange={(e) => setRow(index, { accountId: e.target.value })}
                      >
                        <option value="">Pilih akun</option>
                        {eligible.map((a) => (
                          <option key={a.akun.id} value={a.akun.id}>
                            {a.akun.kode} · {a.akun.nama}
                          </option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label={index === 0 ? "Nilai hasil hitung" : undefined} htmlFor={`adj-value-${index}`}>
                      <TextInput
                        id={`adj-value-${index}`}
                        type="number"
                        mono
                        min={0}
                        step="any"
                        value={row.counted}
                        onChange={(e) => setRow(index, { counted: e.target.value })}
                      />
                    </Field>
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon-xs"
                      aria-label="Hapus baris"
                      disabled={rows.length === 1}
                      onClick={() => setRows((current) => current.filter((_, i) => i !== index))}
                      className="mb-2"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                );
              })}
              <Button type="button" variant="outline" size="xs" onClick={() => setRows((r) => [...r, emptyRow()])}>
                <Plus className="h-3 w-3" />
                Tambah akun
              </Button>
              {!accounts.isLoading && eligible.length === 0 && (
                <p className="text-xs text-ink-muted">Tidak ada akun aset tanpa stok produk untuk disesuaikan.</p>
              )}
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" type="button" onClick={close} disabled={post.isPending}>
              Batal
            </Button>
            <Button type="submit" disabled={!canSubmit || post.isPending}>
              Posting penyesuaian
            </Button>
          </DialogFooter>
        </form>
      </DialogContent>
    </Dialog>
  );
}
