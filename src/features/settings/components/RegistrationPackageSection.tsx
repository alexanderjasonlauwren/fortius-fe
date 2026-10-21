/**
 * "Paket Pendaftaran": reusable Pendaftaran Pangkalan templates a
 * registration invoice picks a fee/kit-item set from. Financial-
 * statements plan P5 / gap-closing plan Phase C. No delete route on the
 * backend -- a package is retired via its own Aktif toggle, the same
 * "no delete, only a status flag" shape bank statement rules already
 * follow.
 */
import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Star, Trash2 } from "lucide-react";
import {
  createPackage,
  getPackage,
  listPackages,
  updatePackage,
  type RegistrationPackage,
} from "@/features/registrationpackages/api/registrationPackageApi";
import { getProducts } from "@/features/products/api/productApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, SelectInput, TextInput, Toggle } from "@/components/common/Field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatRupiah } from "@/lib/format";

interface ItemRow {
  key: number;
  productId: string;
  qty: number;
}
let rowKeySeq = 0;
function emptyRow(productId = "", qty = 1): ItemRow {
  rowKeySeq += 1;
  return { key: rowKeySeq, productId, qty };
}

interface PackageForm {
  id?: string;
  version?: number;
  name: string;
  feeAmount: number;
  isDefault: boolean;
  isActive: boolean;
  items: ItemRow[];
}

const EMPTY_FORM: PackageForm = {
  name: "", feeAmount: 0, isDefault: false, isActive: true, items: [],
};

export function RegistrationPackageSection() {
  const list = useQuery({ queryKey: [...scopeKey(), "registration-packages"], queryFn: listPackages });
  const products = useQuery({ queryKey: [...scopeKey(), "registration-packages", "products"], queryFn: () => getProducts({ onlyActive: true }) });
  const accessoryProducts = (products.data ?? []).filter((p) => p.productKind === "accessory");
  const [editing, setEditing] = useState<PackageForm | null>(null);

  const saveMutation = useDeskMutation({
    mutationFn: (form: PackageForm) => {
      const items = form.items.filter((r) => r.productId).map((r) => ({ productId: r.productId, qty: r.qty }));
      return form.id
        ? updatePackage({
            id: form.id, version: form.version!, name: form.name, feeAmount: form.feeAmount,
            isDefault: form.isDefault, isActive: form.isActive, items,
          })
        : createPackage({ name: form.name, feeAmount: form.feeAmount, isDefault: form.isDefault, items });
    },
    errorTitle: "Paket tidak tersimpan",
    success: (p) => ({ title: `Paket ${p.name} tersimpan` }),
    onDone: () => setEditing(null),
  });

  // The list row's own `items` is always empty -- listPackages() never
  // carries it (see ManualInvoiceDialog's own comment on the same gap).
  // Loading the edit form from it would save back an empty kit, wiping
  // out whatever the package actually has. getPackage's own detail read
  // is the only place that's ever real.
  async function openEdit(pkg: RegistrationPackage) {
    const full = await getPackage(pkg.id);
    setEditing({
      id: full.id, version: full.version, name: full.name, feeAmount: full.feeAmount,
      isDefault: full.isDefault, isActive: full.isActive,
      items: full.items.map((i) => emptyRow(i.productId, i.qty)),
    });
  }

  return (
    <>
      <Panel>
        <PanelHeader
          title="Paket Pendaftaran"
          hint="Templat nilai dan item kit untuk tagihan pendaftaran pangkalan baru."
          actions={
            <CanAccess permission={PERMISSIONS.REGISTRATION_PACKAGES_CREATE}>
              <Button size="sm" onClick={() => setEditing({ ...EMPTY_FORM })}>
                <Plus className="h-3.5 w-3.5" />
                Tambah paket
              </Button>
            </CanAccess>
          }
        />
        {list.isLoading ? (
          <PanelBody className="space-y-3">
            {Array.from({ length: 2 }).map((_, i) => (
              <Skeleton key={i} className="h-16 w-full" />
            ))}
          </PanelBody>
        ) : (list.data ?? []).length === 0 ? (
          <PanelBody>
            <p className="py-8 text-center text-sm text-ink-muted">
              Belum ada paket pendaftaran. "Buat tagihan" tetap bisa mengisi nilai dan item kit secara manual.
            </p>
          </PanelBody>
        ) : (
          <ul className="divide-y divide-line">
            {(list.data ?? []).map((p) => (
              <li key={p.id} className="spine flex flex-wrap items-center gap-4 px-5 py-4">
                <div className="min-w-0 flex-1">
                  <p className="flex items-center gap-2 text-sm font-semibold text-ink">
                    {p.name}
                    {p.isDefault && (
                      <span className="flex items-center gap-1 rounded-sm bg-signal-soft px-1.5 py-0.5 text-2xs font-medium text-signal-ink">
                        <Star className="h-2.5 w-2.5" />
                        Default
                      </span>
                    )}
                    {!p.isActive && <StatusBadge variant="draft" label="Nonaktif" />}
                  </p>
                  <p className="data mt-0.5 text-sm text-ink">{formatRupiah(p.feeAmount)}</p>
                  {p.items.length > 0 && (
                    <p className="text-xs text-ink-muted">
                      {p.items.map((i) => `${i.productName} ×${i.qty}`).join(", ")}
                    </p>
                  )}
                </div>
                <CanAccess permission={PERMISSIONS.REGISTRATION_PACKAGES_UPDATE}>
                  <Button variant="ghost" size="icon-xs" aria-label={`Ubah paket ${p.name}`} onClick={() => openEdit(p)}>
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </CanAccess>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-md">
          <form
            onSubmit={(e) => { e.preventDefault(); if (editing) saveMutation.mutate(editing); }}
          >
            <DialogHeader>
              <DialogTitle>{editing?.id ? "Ubah paket" : "Tambah paket pendaftaran"}</DialogTitle>
              <DialogDescription>
                Dipilih saat membuat tagihan pendaftaran pangkalan, lalu nilai dan item kitnya terisi sekaligus.
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="space-y-4">
                <Field label="Nama paket" htmlFor="pkg-name" required>
                  <TextInput id="pkg-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </Field>
                <Field label="Nilai pendaftaran" htmlFor="pkg-fee" required>
                  <TextInput id="pkg-fee" type="number" min={1} mono value={editing.feeAmount} onChange={(e) => setEditing({ ...editing, feeAmount: Number(e.target.value) })} />
                </Field>

                <div className="space-y-2">
                  <p className="text-xs font-semibold text-ink-muted">Item kit</p>
                  {editing.items.map((row, i) => (
                    <div key={row.key} className="flex items-end gap-2">
                      <Field label={i === 0 ? "Produk" : undefined} htmlFor={`pkg-item-product-${row.key}`} className="flex-1">
                        <SelectInput
                          id={`pkg-item-product-${row.key}`}
                          value={row.productId}
                          onChange={(e) => setEditing({ ...editing, items: editing.items.map((r) => (r.key === row.key ? { ...r, productId: e.target.value } : r)) })}
                        >
                          <option value="">— Pilih —</option>
                          {accessoryProducts.map((p) => (
                            <option key={p.id} value={p.id}>{p.nama}</option>
                          ))}
                        </SelectInput>
                      </Field>
                      <Field label={i === 0 ? "Qty" : undefined} htmlFor={`pkg-item-qty-${row.key}`} className="w-24">
                        <TextInput
                          id={`pkg-item-qty-${row.key}`} type="number" min={1} mono
                          value={row.qty}
                          onChange={(e) => setEditing({ ...editing, items: editing.items.map((r) => (r.key === row.key ? { ...r, qty: Number(e.target.value) } : r)) })}
                        />
                      </Field>
                      <Button
                        type="button" variant="ghost" size="icon-xs" aria-label="Hapus item"
                        onClick={() => setEditing({ ...editing, items: editing.items.filter((r) => r.key !== row.key) })}
                      >
                        <Trash2 className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  ))}
                  <Button type="button" variant="outline" size="sm" onClick={() => setEditing({ ...editing, items: [...editing.items, emptyRow()] })}>
                    <Plus className="h-3.5 w-3.5" />
                    Tambah item kit
                  </Button>
                </div>

                <div className="divide-y divide-line">
                  <Toggle
                    label="Jadikan paket default"
                    description="Dipilih lebih dulu saat membuat tagihan pendaftaran."
                    checked={editing.isDefault}
                    onChange={(isDefault) => setEditing({ ...editing, isDefault })}
                  />
                  {editing.id && (
                    <Toggle
                      label="Aktif"
                      description="Paket nonaktif tidak muncul di pilihan tagihan baru."
                      checked={editing.isActive}
                      onChange={(isActive) => setEditing({ ...editing, isActive })}
                    />
                  )}
                </div>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>Batal</Button>
              <Button type="submit" disabled={saveMutation.isPending || !editing?.name.trim() || !editing?.feeAmount}>
                Simpan paket
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>
    </>
  );
}
