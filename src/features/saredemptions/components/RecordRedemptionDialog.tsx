/**
 * "Catat penebusan": one BNI Pops "Product Allocation" PDF, typed in as it
 * reads (partner doc C6). The header is the transfer; the table is its
 * "Transfer Information Detail", one row per delivery date. Each row's share
 * of the total debit is shown as it will be booked, and the PDF is attached
 * to the penebusan as its evidence once saved.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { FileUp, Plus, Trash2 } from "lucide-react";
import { getProducts } from "@/features/products/api/productApi";
import { getBankAccounts } from "@/features/bankaccounts/api/bankAccountApi";
import { recordRedemption } from "@/features/saredemptions/api/saRedemptionApi";
import type { RedemptionView } from "@/features/saredemptions/api/saRedemptionApi";
import { splitByQuantity } from "@/features/saredemptions/lib/split";
import { ATTACHMENT_ACCEPT, ATTACHMENT_MAX_BYTES, uploadAttachment } from "@/features/attachments/api/attachmentApi";
import { useScope } from "@/features/tenancy/useScope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { NumberInput } from "@/components/common/NumberInput";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { todayIso } from "@/lib/date";
import { scopeKey } from "@/lib/scope";
import { formatRupiah, formatNumber } from "@/lib/format";

interface Row {
  key: number;
  deliveryDate: string;
  quantity: number;
  deliveryNumber: string;
  description: string;
}

let rowKeySeq = 0;
function emptyRow(previous?: Row): Row {
  rowKeySeq += 1;
  // A new row copies the delivery number above it: one allocation is
  // usually delivered under one DN.
  return { key: rowKeySeq, deliveryDate: previous?.deliveryDate ?? "", quantity: 0,
    deliveryNumber: previous?.deliveryNumber ?? "", description: "" };
}

/** A typed amount, or undefined when the field is empty. */
const amountOf = (raw: string) => (raw.trim() === "" ? undefined : Number(raw));

interface RecordRedemptionDialogProps {
  open: boolean;
  /** Pre-fills the SA number, from a Schedule Agreement's own page. */
  saNumber?: string;
  onClose: () => void;
  onSaved: (row: RedemptionView) => void;
}

export function RecordRedemptionDialog({ open, saNumber: initialSA, onClose, onSaved }: RecordRedemptionDialogProps) {
  const { branchId } = useScope();
  const [saNumber, setSANumber] = useState(initialSA ?? "");
  const [reference, setReference] = useState("");
  const [paidOn, setPaidOn] = useState(todayIso);
  const [bankAccountId, setBankAccountId] = useState("");
  const [productId, setProductId] = useState("");
  const [netPrice, setNetPrice] = useState("");
  const [ppn, setPpn] = useState("");
  const [pbbkb, setPbbkb] = useState("");
  const [pph, setPph] = useState("");
  const [totalDebit, setTotalDebit] = useState("");
  const [depot, setDepot] = useState("");
  const [notes, setNotes] = useState("");
  const [rows, setRows] = useState<Row[]>(() => [emptyRow()]);
  const [file, setFile] = useState<File | null>(null);

  const products = useQuery({ queryKey: [...scopeKey(), "products"], queryFn: () => getProducts({ onlyActive: true }), enabled: open });
  const banks = useQuery({ queryKey: [...scopeKey(), "bank-accounts"], queryFn: getBankAccounts, enabled: open });
  const commodities = (products.data ?? []).filter((p) => p.productKind !== "container" && p.productKind !== "accessory");
  // LPG 3 Kg is what an SA allocates; preselected when the catalogue has it.
  const product = productId || commodities.find((p) => p.kode === "LPG-3KG")?.id || commodities[0]?.id || "";
  const bankRows = (banks.data ?? []).filter((b) => b.aktif && b.kind === "bank");

  const reset = () => {
    setSANumber(initialSA ?? ""); setReference(""); setPaidOn(todayIso()); setBankAccountId(""); setProductId("");
    setNetPrice(""); setPpn(""); setPbbkb(""); setPph(""); setTotalDebit(""); setDepot(""); setNotes("");
    setRows([emptyRow()]); setFile(null);
  };
  const update = (key: number, patch: Partial<Row>) =>
    setRows(rows.map((r) => (r.key === key ? { ...r, ...patch } : r)));

  const total = Number(totalDebit) || 0;
  const shares = splitByQuantity(total, rows.map((r) => r.quantity));
  const totalQty = rows.reduce((s, r) => s + r.quantity, 0);
  const breakdown = [netPrice, ppn, pbbkb, pph].map(amountOf);
  const breakdownGiven = breakdown[0] !== undefined;
  const breakdownSum = breakdown.reduce<number>((s, v) => s + (v ?? 0), 0);
  const breakdownOff = breakdownGiven && Math.abs(breakdownSum - total) > 0.005;
  const fileTooBig = !!file && file.size > ATTACHMENT_MAX_BYTES;

  const save = useDeskMutation({
    mutationFn: async () => {
      const row = await recordRedemption({
        branchId: branchId ?? "",
        saNumber, transactionReference: reference, paidOn,
        bankAccountId: bankAccountId || undefined,
        netPrice: breakdown[0], ppn: breakdown[1], pbbkb: breakdown[2], pph: breakdown[3],
        totalDebit: total, depot, notes,
        deliveries: rows.map((r) => ({
          productId: product, deliveryDate: r.deliveryDate, quantity: r.quantity,
          deliveryNumber: r.deliveryNumber, description: r.description,
        })),
      });
      // The PDF is the penebusan's evidence; a failed upload leaves the
      // penebusan recorded and is said so, rather than undoing it.
      if (file) {
        try {
          await uploadAttachment("sa_redemption", row.id, file);
        } catch {
          row.warnings = [...row.warnings, "PDF belum terlampir; lampirkan dari halaman penebusan."];
        }
      }
      return row;
    },
    success: (row) => ({
      title: `${row.redemptionNumber} dicatat`,
      description: [
        `${formatNumber(row.receivedQuantity)} dari ${formatNumber(row.totalQuantity)} tabung sudah diterima.`,
        ...row.warnings,
      ].join(" "),
    }),
    errorTitle: "Penebusan tidak tersimpan",
    onDone: (row) => { onSaved(row); reset(); onClose(); },
  });

  const rowOk = (r: Row) => !!r.deliveryDate && r.quantity > 0;
  const canSubmit = !!branchId && saNumber.trim() !== "" && reference.trim() !== "" && !!paidOn && !!product &&
    total > 0 && rows.length > 0 && rows.every(rowOk) && !breakdownOff && !fileTooBig;

  return (
    <Dialog open={open} onOpenChange={(next) => { if (!next) { reset(); onClose(); } }}>
      <DialogContent className="sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Catat penebusan SA</DialogTitle>
          <DialogDescription>
            Isi dari PDF BNI Pops "Product Allocation". Pembayaran masuk ke Uang Muka Pembelian pada
            tanggal bayar; tiap baris pindah ke Persediaan pada tanggal kirimnya. Baris yang tanggalnya
            belum tiba diterima nanti.
          </DialogDescription>
        </DialogHeader>

        <div className="max-h-[70vh] space-y-4 overflow-y-auto pr-1">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <Field label="Schedule Agreement" htmlFor="pnb-sa" required>
              <TextInput id="pnb-sa" mono maxLength={100} value={saNumber} placeholder="3107050"
                onChange={(e) => setSANumber(e.target.value)} />
            </Field>
            <Field label="Transaction Reference No" htmlFor="pnb-ref" required>
              <TextInput id="pnb-ref" mono maxLength={100} value={reference} placeholder="202611141976389298"
                onChange={(e) => setReference(e.target.value)} />
            </Field>
            <Field label="Tanggal bayar (Execute)" htmlFor="pnb-paid" required>
              <TextInput id="pnb-paid" type="date" max={todayIso()} value={paidOn} onChange={(e) => setPaidOn(e.target.value)} />
            </Field>
            <Field label="Rekening yang didebit" htmlFor="pnb-bank" hint="Kosong = rekening utama.">
              <SelectInput id="pnb-bank" value={bankAccountId} onChange={(e) => setBankAccountId(e.target.value)}>
                <option value="">Rekening utama</option>
                {bankRows.map((b) => (
                  <option key={b.id} value={b.id}>{b.bank} {b.nomorRekening} · {b.ledgerAccountCode}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Produk" htmlFor="pnb-product" required>
              <SelectInput id="pnb-product" value={product} onChange={(e) => setProductId(e.target.value)}>
                {commodities.map((p) => <option key={p.id} value={p.id}>{p.kode} · {p.nama}</option>)}
              </SelectInput>
            </Field>
            <Field label="Depot" htmlFor="pnb-depot">
              <TextInput id="pnb-depot" maxLength={255} value={depot} placeholder="235G-SPBE-YOSO ARTOPOTRO"
                onChange={(e) => setDepot(e.target.value)} />
            </Field>
          </div>

          <div className="grid grid-cols-2 gap-4 sm:grid-cols-5">
            <Field label="Net Price" htmlFor="pnb-net">
              <NumberInput id="pnb-net" placeholder="0" value={amountOf(netPrice) ?? 0} onValueChange={(value) => setNetPrice(value ? String(value) : "")} />
            </Field>
            <Field label="PPn" htmlFor="pnb-ppn">
              <NumberInput id="pnb-ppn" placeholder="0" value={amountOf(ppn) ?? 0} onValueChange={(value) => setPpn(value ? String(value) : "")} />
            </Field>
            <Field label="PBBKB" htmlFor="pnb-pbbkb">
              <NumberInput id="pnb-pbbkb" placeholder="0" value={amountOf(pbbkb) ?? 0} onValueChange={(value) => setPbbkb(value ? String(value) : "")} />
            </Field>
            <Field label="PPh" htmlFor="pnb-pph">
              <NumberInput id="pnb-pph" placeholder="0" value={amountOf(pph) ?? 0} onValueChange={(value) => setPph(value ? String(value) : "")} />
            </Field>
            <Field label="Total Debit Amount" htmlFor="pnb-total" required
              error={breakdownOff ? `Net + PPn + PBBKB + PPh = ${formatRupiah(breakdownSum)}` : undefined}>
              <NumberInput id="pnb-total" placeholder="0" value={amountOf(totalDebit) ?? 0} onValueChange={(value) => setTotalDebit(value ? String(value) : "")} />
            </Field>
          </div>

          <div className="space-y-2">
            <p className="text-xs font-semibold text-ink-muted">Transfer Information Detail (satu baris per tanggal kirim)</p>
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-line text-2xs text-ink-muted">
                    <th className="py-1.5 pr-2">Tanggal kirim</th>
                    <th className="py-1.5 pr-2">Jumlah</th>
                    <th className="py-1.5 pr-2">Delivery Number</th>
                    <th className="py-1.5 pr-2">Keterangan</th>
                    <th className="py-1.5 pr-2 text-right">Nilai</th>
                    <th />
                  </tr>
                </thead>
                <tbody>
                  {rows.map((r, i) => (
                    <tr key={r.key} className="border-b border-line align-top">
                      <td className="py-1.5 pr-2">
                        <TextInput aria-label={`Tanggal kirim baris ${i + 1}`} type="date" value={r.deliveryDate}
                          onChange={(e) => update(r.key, { deliveryDate: e.target.value })} />
                      </td>
                      <td className="w-28 py-1.5 pr-2">
                        <NumberInput decimals={0} placeholder="0" aria-label={`Jumlah baris ${i + 1}`} value={r.quantity}
                          onValueChange={(value) => update(r.key, { quantity: value })} />
                      </td>
                      <td className="w-36 py-1.5 pr-2">
                        <TextInput aria-label={`Delivery number baris ${i + 1}`} mono maxLength={100} value={r.deliveryNumber}
                          onChange={(e) => update(r.key, { deliveryNumber: e.target.value })} />
                      </td>
                      <td className="py-1.5 pr-2">
                        <TextInput aria-label={`Keterangan baris ${i + 1}`} maxLength={500} value={r.description}
                          placeholder="Otomatis bila kosong" onChange={(e) => update(r.key, { description: e.target.value })} />
                      </td>
                      <td className="data whitespace-nowrap py-3 pr-2 text-right">{formatRupiah(shares[i] ?? 0)}</td>
                      <td className="py-1.5">
                        <Button type="button" variant="ghost" size="icon-xs" aria-label="Hapus baris"
                          disabled={rows.length <= 1} onClick={() => setRows(rows.filter((x) => x.key !== r.key))}>
                          <Trash2 className="h-3.5 w-3.5" />
                        </Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button type="button" variant="outline" size="sm" onClick={() => setRows([...rows, emptyRow(rows[rows.length - 1])])}>
                <Plus className="h-3.5 w-3.5" /> Baris
              </Button>
              <p className="text-xs text-ink-muted">
                {formatNumber(totalQty)} tabung
                {totalQty > 0 && total > 0 && <> · {formatRupiah(total / totalQty)} per tabung</>}
                {" "}· nilai dibagi menurut jumlah tabung, sampai rupiah
              </p>
            </div>
          </div>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="PDF BNI Pops" htmlFor="pnb-file" hint="Disimpan sebagai bukti penebusan."
              error={fileTooBig ? "Berkas lebih dari 10 MB" : undefined}>
              <label htmlFor="pnb-file" className="flex cursor-pointer items-center gap-2 rounded-md border border-dashed border-line px-3 py-2 text-sm text-ink-muted hover:text-ink">
                <FileUp className="h-4 w-4" />
                <span className="truncate">{file ? file.name : "Pilih PDF atau foto"}</span>
              </label>
              <input id="pnb-file" type="file" accept={ATTACHMENT_ACCEPT} className="sr-only"
                onChange={(e) => setFile(e.target.files?.[0] ?? null)} />
            </Field>
            <Field label="Catatan" htmlFor="pnb-notes">
              <TextareaInput id="pnb-notes" rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => { reset(); onClose(); }} disabled={save.isPending}>
            Batal
          </Button>
          <Button type="button" disabled={!canSubmit || save.isPending} onClick={() => save.mutate(undefined as never)}>
            Simpan penebusan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
