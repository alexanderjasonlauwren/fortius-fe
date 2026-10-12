/**
 * "Buat tagihan": a Pendaftaran Pangkalan registration invoice (fee +
 * optional kit items, picked from a template or typed by hand) or a
 * free-form "Lain-lain" charge against whichever revenue account each
 * line names. Financial-statements plan P5 / gap-closing plan Phase C.
 */
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { getOutletList } from "@/features/outlet/api/outletApi";
import { getProducts } from "@/features/products/api/productApi";
import { getChartOfAccounts, createManualInvoice } from "@/features/finance/api/financeApi";
import {
  getPackage,
  listPackages,
  type RegistrationPackage,
} from "@/features/registrationpackages/api/registrationPackageApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SegmentedControl, SelectInput, TextareaInput, TextInput } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { formatRupiah } from "@/lib/format";
import { outletLabel } from "@/lib/lexicon";
import { leafAccounts } from "@/features/finance/lib/accounts";
import { scopeKey } from "@/lib/scope";

type Jenis = "registration" | "other";

interface KitRow {
  key: number;
  productId: string;
  qty: number;
}
interface LineRow {
  key: number;
  description: string;
  amount: number;
  revenueAccountId: string;
}

let rowKeySeq = 0;
function emptyKit(): KitRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, productId: "", qty: 1 };
}
function emptyLine(): LineRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, description: "", amount: 0, revenueAccountId: "" };
}

interface ManualInvoiceDialogProps {
  open: boolean;
  onClose: () => void;
  onCreated: () => void;
}

export function ManualInvoiceDialog({ open, onClose, onCreated }: ManualInvoiceDialogProps) {
  const [jenis, setJenis] = useState<Jenis>("registration");
  const [outletId, setOutletId] = useState("");
  const [issueDate, setIssueDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [description, setDescription] = useState("");

  const [packageId, setPackageId] = useState("");
  const [feeAmount, setFeeAmount] = useState(0);
  const [kitRows, setKitRows] = useState<KitRow[]>([]);

  const [lineRows, setLineRows] = useState<LineRow[]>([emptyLine()]);

  const outlets = useQuery({ queryKey: [...scopeKey(), "manual-invoice", "outlets"], queryFn: () => getOutletList(), enabled: open });
  const packages = useQuery({ queryKey: [...scopeKey(), "manual-invoice", "packages"], queryFn: listPackages, enabled: open && jenis === "registration" });
  const accounts = useQuery({ queryKey: [...scopeKey(), "manual-invoice", "accounts"], queryFn: getChartOfAccounts, enabled: open });
  const kitProducts = useQuery({
    queryKey: [...scopeKey(), "manual-invoice", "kit-products"],
    queryFn: () => getProducts({ onlyActive: true }),
    enabled: open && jenis === "registration",
  });
  // leafAccounts: ledger.Post refuses a line posted to a grouping header
  // ("Akun %s adalah akun induk; posting harus ke sub-akun"), caught live
  // for the sibling pick in ManualJournalDialog -- the same chart, the
  // same real restriction, so this picker excludes parents too.
  const revenueAccounts = leafAccounts((accounts.data ?? []).filter((a) => a.akun.tipe === "Pendapatan"));
  const accessoryProducts = (kitProducts.data ?? []).filter((p) => p.productKind === "accessory");

  function reset() {
    setJenis("registration");
    setOutletId("");
    setIssueDate(new Date().toISOString().slice(0, 10));
    setDescription("");
    setPackageId("");
    setFeeAmount(0);
    setKitRows([]);
    setLineRows([emptyLine()]);
  }

  // listPackages() never carries items (deliberately -- see the real
  // backend's own ListPackages, which passes nil rather than eager-loading
  // every row's kit items for a picker that only needs name/fee). The
  // full set only ever comes from getPackage's own detail read.
  async function applyPackage(id: string) {
    setPackageId(id);
    if (!id) { setFeeAmount(0); setKitRows([]); return; }
    const pkg = await getPackage(id);
    setFeeAmount(pkg.feeAmount);
    setKitRows(
      pkg.items.map((item) => {
        rowKeySeq += 1;
        return { key: rowKeySeq, productId: item.productId, qty: item.qty };
      }),
    );
  }

  const create = useDeskMutation({
    mutationFn: () =>
      createManualInvoice({
        invoiceType: jenis,
        outletId,
        issueDate,
        description: description || undefined,
        packageId: jenis === "registration" ? (packageId || undefined) : undefined,
        feeAmount: jenis === "registration" ? feeAmount : undefined,
        kitItems: jenis === "registration"
          ? kitRows.filter((k) => k.productId).map((k) => ({ productId: k.productId, qty: k.qty }))
          : undefined,
        lines: jenis === "other"
          ? lineRows.map((l) => ({ description: l.description, amount: l.amount, revenueAccountId: l.revenueAccountId }))
          : undefined,
      }),
    success: (row) => ({ title: `${row.nomor} diterbitkan` }),
    errorTitle: "Tagihan tidak tersimpan",
    onDone: () => { reset(); onCreated(); onClose(); },
  });

  const totalLines = lineRows.reduce((s, l) => s + (l.amount || 0), 0);
  const canSubmit =
    !!outletId && !!issueDate &&
    (jenis === "registration"
      ? feeAmount > 0 || !!packageId
      : lineRows.length > 0 && lineRows.every((l) => l.description.trim() && l.amount > 0 && l.revenueAccountId));

  return (
    <Dialog open={open} onOpenChange={(next) => !next && (reset(), onClose())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Buat tagihan</DialogTitle>
          <DialogDescription>
            Tagihan tanpa surat jalan di baliknya -- pendaftaran pangkalan baru, atau biaya lain-lain.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <Field label="Jenis" htmlFor="mi-jenis">
            <SegmentedControl
              value={jenis}
              onChange={setJenis}
              options={[
                { value: "registration" as const, label: "Pendaftaran Pangkalan" },
                { value: "other" as const, label: "Lain-lain" },
              ]}
            />
          </Field>

          <div className="grid grid-cols-2 gap-4">
            <Field label={outletLabel()} htmlFor="mi-outlet" required>
              <SelectInput id="mi-outlet" value={outletId} onChange={(e) => setOutletId(e.target.value)}>
                <option value="">— Pilih —</option>
                {(outlets.data ?? []).map((o) => (
                  <option key={o.id} value={o.id}>{o.nama}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Tanggal terbit" htmlFor="mi-date" required>
              <TextInput id="mi-date" type="date" value={issueDate} onChange={(e) => setIssueDate(e.target.value)} />
            </Field>
          </div>

          {jenis === "registration" ? (
            <>
              <Field label="Paket pendaftaran" htmlFor="mi-package" hint="Opsional -- mengisi nilai dan item kit di bawah.">
                <SelectInput id="mi-package" value={packageId} onChange={(e) => applyPackage(e.target.value)}>
                  <option value="">— Tanpa paket —</option>
                  {(packages.data ?? []).filter((p: RegistrationPackage) => p.isActive).map((p) => (
                    <option key={p.id} value={p.id}>{p.name} ({formatRupiah(p.feeAmount)})</option>
                  ))}
                </SelectInput>
              </Field>
              <Field label="Nilai pendaftaran" htmlFor="mi-fee" required>
                <TextInput id="mi-fee" type="number" min={1} mono value={feeAmount} onChange={(e) => setFeeAmount(Number(e.target.value))} />
              </Field>
              <div className="space-y-2">
                <p className="text-xs font-semibold text-ink-muted">Item kit (opsional)</p>
                {kitRows.map((row, i) => (
                  <div key={row.key} className="flex items-end gap-2">
                    <Field label={i === 0 ? "Produk" : undefined} htmlFor={`mi-kit-product-${row.key}`} className="flex-1">
                      <SelectInput
                        id={`mi-kit-product-${row.key}`}
                        value={row.productId}
                        onChange={(e) => setKitRows(kitRows.map((k) => (k.key === row.key ? { ...k, productId: e.target.value } : k)))}
                      >
                        <option value="">— Pilih —</option>
                        {accessoryProducts.map((p) => (
                          <option key={p.id} value={p.id}>{p.nama}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label={i === 0 ? "Qty" : undefined} htmlFor={`mi-kit-qty-${row.key}`} className="w-24">
                      <TextInput
                        id={`mi-kit-qty-${row.key}`} type="number" min={1} mono
                        value={row.qty}
                        onChange={(e) => setKitRows(kitRows.map((k) => (k.key === row.key ? { ...k, qty: Number(e.target.value) } : k)))}
                      />
                    </Field>
                    <Button type="button" variant="ghost" size="icon-xs" aria-label="Hapus item" onClick={() => setKitRows(kitRows.filter((k) => k.key !== row.key))}>
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                ))}
                <Button type="button" variant="outline" size="sm" onClick={() => setKitRows([...kitRows, emptyKit()])}>
                  <Plus className="h-3.5 w-3.5" />
                  Tambah item kit
                </Button>
              </div>
            </>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold text-ink-muted">Baris tagihan</p>
              {lineRows.map((row, i) => (
                <div key={row.key} className="space-y-2 rounded-md border border-line p-3">
                  <Field label={i === 0 ? "Keterangan" : undefined} htmlFor={`mi-line-desc-${row.key}`}>
                    <TextInput
                      id={`mi-line-desc-${row.key}`}
                      value={row.description}
                      onChange={(e) => setLineRows(lineRows.map((l) => (l.key === row.key ? { ...l, description: e.target.value } : l)))}
                    />
                  </Field>
                  <div className="flex items-end gap-2">
                    <Field label={i === 0 ? "Akun pendapatan" : undefined} htmlFor={`mi-line-account-${row.key}`} className="flex-1">
                      <SelectInput
                        id={`mi-line-account-${row.key}`}
                        value={row.revenueAccountId}
                        onChange={(e) => setLineRows(lineRows.map((l) => (l.key === row.key ? { ...l, revenueAccountId: e.target.value } : l)))}
                      >
                        <option value="">— Pilih —</option>
                        {revenueAccounts.map((a) => (
                          <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} — {a.akun.nama}</option>
                        ))}
                      </SelectInput>
                    </Field>
                    <Field label={i === 0 ? "Nilai" : undefined} htmlFor={`mi-line-amount-${row.key}`} className="w-40">
                      <TextInput
                        id={`mi-line-amount-${row.key}`} type="number" min={1} mono
                        value={row.amount}
                        onChange={(e) => setLineRows(lineRows.map((l) => (l.key === row.key ? { ...l, amount: Number(e.target.value) } : l)))}
                      />
                    </Field>
                    <Button
                      type="button" variant="ghost" size="icon-xs" aria-label="Hapus baris"
                      disabled={lineRows.length <= 1}
                      onClick={() => setLineRows(lineRows.filter((l) => l.key !== row.key))}
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  </div>
                </div>
              ))}
              <div className="flex items-center justify-between">
                <Button type="button" variant="outline" size="sm" onClick={() => setLineRows([...lineRows, emptyLine()])}>
                  <Plus className="h-3.5 w-3.5" />
                  Tambah baris
                </Button>
                <p className="text-xs text-ink-muted">
                  Total: <span className="data font-semibold text-ink">{formatRupiah(totalLines)}</span>
                </p>
              </div>
            </div>
          )}

          <Field label="Catatan" htmlFor="mi-description">
            <TextareaInput id="mi-description" rows={2} value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={onClose} disabled={create.isPending}>Batal</Button>
          <Button type="button" disabled={!canSubmit || create.isPending} onClick={() => create.mutate(undefined as never)}>
            {create.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Terbitkan tagihan
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
