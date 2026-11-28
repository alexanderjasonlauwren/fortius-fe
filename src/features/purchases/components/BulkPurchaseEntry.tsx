/**
 * "Input banyak" (partner doc C8): many bill lines in one table, each with
 * its own Tanggal, Vendor and Keterangan. "+ Baris" copies Tanggal and Vendor
 * from the row above. "Simpan semua" sends every row at once; the server
 * checks them all first, writes one bill per date and vendor in a single
 * transaction, and names each bad row, which is marked red here.
 */
import { useState } from "react";
import { Plus, Trash2 } from "lucide-react";
import { recordBulkPurchases } from "@/features/purchases/api/purchaseApi";
import {
  billCount, lineAmount, nextBulkRow, rowProblems, violationsByRow, type BulkRow,
} from "@/features/purchases/lib/bulkRows";
import { useScope } from "@/features/tenancy/useScope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { SelectInput, TextInput } from "@/components/common/Field";
import { NumberInput } from "@/components/common/NumberInput";
import { Button } from "@/components/ui/button";
import { DialogFooter } from "@/components/ui/dialog";
import { ApiError } from "@/lib/api";
import { todayIso } from "@/lib/date";
import { formatNumber, formatRupiah } from "@/lib/format";
import { cn } from "@/lib/utils";

// Tanggal, Vendor, Barang/Jasa, Produk/Akun, Qty, Harga satuan, Total, Keterangan, delete.
const COLUMN_WIDTHS = ["w-36", "w-48", "w-28", "w-52", "w-24", "w-36", "w-36", "w-auto", "w-10"];

export interface BulkOption {
  id: string;
  label: string;
}

interface BulkPurchaseEntryProps {
  vendors: BulkOption[];
  products: BulkOption[];
  accounts: BulkOption[];
  onCancel: () => void;
  onSaved: () => void;
}

export function BulkPurchaseEntry({ vendors, products, accounts, onCancel, onSaved }: BulkPurchaseEntryProps) {
  const { branchId } = useScope();
  const [rows, setRows] = useState<BulkRow[]>(() => [nextBulkRow(undefined, todayIso())]);
  const [attempted, setAttempted] = useState(false);
  const [serverErrors, setServerErrors] = useState<Map<number, Record<string, string>>>(new Map());

  const update = (key: number, patch: Partial<BulkRow>) => {
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));
    // An edited row is the user's answer to its refusal; the rest stay red.
    const index = rows.findIndex((r) => r.key === key);
    if (serverErrors.has(index)) {
      const next = new Map(serverErrors);
      next.delete(index);
      setServerErrors(next);
    }
  };
  const remove = (key: number) => {
    setRows(rows.filter((r) => r.key !== key));
    setServerErrors(new Map());
  };

  const save = useDeskMutation({
    mutationFn: () =>
      recordBulkPurchases({
        branchId: branchId ?? undefined,
        rows: rows.map((r) => ({
          date: r.date,
          supplierId: r.supplierId,
          vendorInvoiceNumber: r.vendorInvoiceNumber || undefined,
          productId: r.kind === "product" ? r.productId : undefined,
          accountId: r.kind === "account" ? r.accountId : undefined,
          description: r.description,
          quantity: r.quantity,
          unitCost: r.unitCost,
        })),
      }),
    success: (bills) => ({
      title: `${formatNumber(bills.length)} tagihan dicatat`,
      description: bills.map((b) => b.purchaseNumber).join(", "),
    }),
    errorTitle: "Belum ada yang tersimpan",
    onFail: (error) => setServerErrors(error instanceof ApiError ? violationsByRow(error.violations) : new Map()),
    onDone: () => onSaved(),
  });

  const problemsOf = (row: BulkRow, index: number) => ({
    ...(attempted ? rowProblems(row) : {}),
    ...serverErrors.get(index),
  });
  const total = rows.reduce((sum, r) => sum + lineAmount(r.quantity, r.unitCost), 0);
  const allValid = rows.every((r) => Object.keys(rowProblems(r)).length === 0);
  const submit = () => {
    setAttempted(true);
    if (allValid) save.mutate(undefined as never);
  };

  return (
    <>
      <div className="-mx-1 overflow-x-auto px-1">
        {/* Fixed widths: a long vendor or product name must not squeeze Qty
            and Harga satuan, the columns typed into most. */}
        <table className="w-full min-w-[78rem] table-fixed text-left text-sm">
          <colgroup>
            {COLUMN_WIDTHS.map((w, i) => <col key={i} className={w} />)}
          </colgroup>
          <thead>
            <tr className="border-b border-line">
              {["Tanggal", "Vendor", "Barang/Jasa", "Produk / Akun", "Qty", "Harga satuan", "Total", "Keterangan", ""].map((h, i) => (
                <th key={i} className={cn("label px-1.5 py-2 text-2xs text-ink-muted", (i >= 4 && i <= 6) && "text-right")}>{h}</th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((row, index) => {
              const problems = problemsOf(row, index);
              const bad = Object.keys(problems).length > 0;
              const n = index + 1;
              return (
                <tr key={row.key} className={cn("border-b border-line align-top", bad && "bg-rust/5")}>
                  <td className="px-1.5 py-1.5">
                    <TextInput type="date" aria-label={`Tanggal baris ${n}`} value={row.date} invalid={!!problems.date}
                      onChange={(e) => update(row.key, { date: e.target.value })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <SelectInput aria-label={`Vendor baris ${n}`} value={row.supplierId} invalid={!!problems.supplier_id}
                      onChange={(e) => update(row.key, { supplierId: e.target.value })}>
                      <option value="">— Pilih —</option>
                      {vendors.map((v) => <option key={v.id} value={v.id}>{v.label}</option>)}
                    </SelectInput>
                  </td>
                  <td className="px-1.5 py-1.5">
                    <SelectInput aria-label={`Jenis baris ${n}`} value={row.kind}
                      onChange={(e) => update(row.key, { kind: e.target.value as BulkRow["kind"], productId: "", accountId: "" })}>
                      <option value="product">Barang</option>
                      <option value="account">Jasa / biaya</option>
                    </SelectInput>
                  </td>
                  <td className="px-1.5 py-1.5">
                    {row.kind === "product" ? (
                      <SelectInput aria-label={`Produk baris ${n}`} value={row.productId} invalid={!!problems.product_id}
                        onChange={(e) => update(row.key, { productId: e.target.value })}>
                        <option value="">— Pilih produk —</option>
                        {products.map((p) => <option key={p.id} value={p.id}>{p.label}</option>)}
                      </SelectInput>
                    ) : (
                      <SelectInput aria-label={`Akun baris ${n}`} value={row.accountId} invalid={!!problems.account_id}
                        onChange={(e) => update(row.key, { accountId: e.target.value })}>
                        <option value="">— Pilih akun —</option>
                        {accounts.map((a) => <option key={a.id} value={a.id}>{a.label}</option>)}
                      </SelectInput>
                    )}
                  </td>
                  <td className="px-1.5 py-1.5">
                    <NumberInput aria-label={`Qty baris ${n}`} decimals={0} placeholder="0" value={row.quantity}
                      invalid={!!problems.quantity} onValueChange={(quantity) => update(row.key, { quantity })} />
                  </td>
                  <td className="px-1.5 py-1.5">
                    <NumberInput aria-label={`Harga satuan baris ${n}`} decimals={4} placeholder="0" value={row.unitCost}
                      invalid={!!problems.unit_cost} onValueChange={(unitCost) => update(row.key, { unitCost })} />
                  </td>
                  <td className="data whitespace-nowrap px-1.5 py-3 text-right">{formatRupiah(lineAmount(row.quantity, row.unitCost))}</td>
                  <td className="px-1.5 py-1.5">
                    <TextInput aria-label={`Keterangan baris ${n}`} maxLength={500} value={row.description}
                      invalid={!!problems.description} placeholder="Masuk ke keterangan jurnal"
                      onChange={(e) => update(row.key, { description: e.target.value })} />
                    {bad && (
                      <p className="mt-1 text-2xs text-rust-ink">{Object.values(problems).join(" · ")}</p>
                    )}
                  </td>
                  <td className="px-1 py-1.5">
                    <Button type="button" variant="ghost" size="icon-xs" aria-label={`Hapus baris ${n}`}
                      disabled={rows.length <= 1} onClick={() => remove(row.key)}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <div className="flex flex-wrap items-center justify-between gap-2">
        <Button type="button" variant="outline" size="sm"
          onClick={() => setRows([...rows, nextBulkRow(rows[rows.length - 1], todayIso())])}>
          <Plus className="h-3.5 w-3.5" /> Baris
        </Button>
        <p className="text-xs text-ink-muted">
          {formatNumber(rows.length)} baris · {formatNumber(billCount(rows))} tagihan · Total{" "}
          <span className="data font-semibold text-ink">{formatRupiah(total)}</span>
        </p>
      </div>
      {attempted && !allValid && (
        <p className="text-xs text-rust-ink">Baris yang ditandai merah belum lengkap. Belum ada yang disimpan.</p>
      )}

      <DialogFooter>
        <Button type="button" variant="outline" onClick={onCancel} disabled={save.isPending}>Batal</Button>
        <Button type="button" onClick={submit} disabled={save.isPending}>Simpan semua</Button>
      </DialogFooter>
    </>
  );
}
