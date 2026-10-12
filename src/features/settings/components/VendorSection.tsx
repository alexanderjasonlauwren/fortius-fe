/**
 * Admin CRUD for Vendor -- local suppliers a general purchase (gap-closing
 * plan, Phase F) pays. Deliberately a SEPARATE screen from SupplierSection,
 * not a promotion of it: that one manages the tenant's own configurable
 * "Pemasok" lexicon term (SPBE/distributor, a free-text name off
 * core.schedule_agreements with no real master table), while this manages
 * a genuine `core.suppliers` row -- the two share no backing table even
 * though they read the same word in Indonesian. See VendorEntity's own doc
 * in @/types/domain for the full reasoning.
 */
import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Factory, Pencil, Plus, Trash2 } from "lucide-react";
import { createVendor, deleteVendor, getVendors, updateVendor, type VendorView } from "@/features/suppliers/api/vendorApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, TextInput, Toggle } from "@/components/common/Field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface VendorForm {
  id?: string;
  version?: number;
  code: string;
  name: string;
  npwp: string;
  address: string;
  phone: string;
  status: "atv" | "ina";
}

const EMPTY: VendorForm = { code: "", name: "", npwp: "", address: "", phone: "", status: "atv" };

export function VendorSection() {
  const list = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors });
  const [editing, setEditing] = useState<VendorForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VendorView | null>(null);

  const saveMutation = useDeskMutation({
    mutationFn: (values: VendorForm) =>
      values.id
        ? updateVendor({
            id: values.id,
            version: values.version!,
            name: values.name,
            npwp: values.npwp || undefined,
            address: values.address || undefined,
            phone: values.phone || undefined,
            status: values.status,
          })
        : createVendor({
            code: values.code,
            name: values.name,
            npwp: values.npwp || undefined,
            address: values.address || undefined,
            phone: values.phone || undefined,
          }),
    errorTitle: "Vendor tidak tersimpan",
    success: (row) => ({ title: `${row.name} tersimpan` }),
    onDone: () => setEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => deleteVendor(id),
    errorTitle: "Hapus vendor gagal",
    success: "Vendor dihapus",
    onDone: () => setPendingDelete(null),
  });

  const open = (row?: VendorView) => {
    setEditing(
      row
        ? { id: row.id, version: row.version, code: row.code, name: row.name, npwp: row.npwp ?? "", address: row.address ?? "", phone: row.phone ?? "", status: row.status }
        : { ...EMPTY },
    );
  };

  const columns: Column<VendorView>[] = [
    {
      key: "name",
      header: "Vendor",
      render: (row) => (
        <>
          <span className="block font-medium text-ink">{row.name}</span>
          <span className="data block text-2xs text-ink-muted">{row.code}</span>
        </>
      ),
      sortValue: (row) => row.name,
    },
    {
      key: "kontak",
      header: "Kontak",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.phone || "—"}</span>
          <span className="block text-2xs text-ink-muted">{row.npwp || "—"}</span>
        </>
      ),
    },
    { key: "alamat", header: "Alamat", render: (row) => <span className="text-xs text-ink-muted">{row.address || "—"}</span> },
    {
      key: "status",
      header: "Status",
      width: "7rem",
      render: (row) => <StatusBadge variant={row.status === "atv" ? "success" : "draft"} label={row.status === "atv" ? "Aktif" : "Nonaktif"} />,
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button variant="ghost" size="icon-xs" aria-label={`Ubah ${row.name}`} onClick={() => open(row)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon-xs" aria-label={`Hapus ${row.name}`} onClick={() => setPendingDelete(row)} className="hover:bg-rust-soft hover:text-rust-ink">
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      ),
    },
  ];

  return (
    <>
      <Panel>
        <PanelHeader
          title="Vendor"
          hint="Dipakai saat mencatat pembelian umum (bukan lewat Schedule Agreement)."
          actions={
            <Button size="sm" onClick={() => open()}>
              <Plus className="h-3.5 w-3.5" />
              Tambah vendor
            </Button>
          }
        />
        <DataTable
          columns={columns}
          data={list.data ?? []}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => (row.status === "atv" ? "text-pine" : "text-draft")}
          emptyIcon={Factory}
          emptyMessage="Belum ada vendor"
          emptyDescription="Tambahkan vendor agar dapat dipilih saat mencatat pembelian umum."
          dense
        />
      </Panel>

      <Dialog open={!!editing} onOpenChange={(o) => !o && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <form
            onSubmit={(e) => {
              e.preventDefault();
              if (editing) saveMutation.mutate(editing);
            }}
          >
            <DialogHeader>
              <DialogTitle>{editing?.id ? `Ubah ${editing.name}` : "Tambah vendor"}</DialogTitle>
              <DialogDescription>Vendor pembelian umum, terpisah dari pemasok Schedule Agreement.</DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Kode" htmlFor="vnd-code" required hint={editing.id ? "Tidak dapat diubah." : undefined}>
                  <TextInput id="vnd-code" mono disabled={!!editing.id} value={editing.code} placeholder="VND-001" onChange={(e) => setEditing({ ...editing, code: e.target.value })} />
                </Field>
                <Field label="Nama" htmlFor="vnd-name" required>
                  <TextInput id="vnd-name" value={editing.name} onChange={(e) => setEditing({ ...editing, name: e.target.value })} />
                </Field>
                <Field label="NPWP" htmlFor="vnd-npwp">
                  <TextInput id="vnd-npwp" mono value={editing.npwp} onChange={(e) => setEditing({ ...editing, npwp: e.target.value })} />
                </Field>
                <Field label="Telepon" htmlFor="vnd-phone">
                  <TextInput id="vnd-phone" mono value={editing.phone} onChange={(e) => setEditing({ ...editing, phone: e.target.value })} />
                </Field>
                <Field label="Alamat" htmlFor="vnd-address" className="sm:col-span-2">
                  <TextInput id="vnd-address" value={editing.address} onChange={(e) => setEditing({ ...editing, address: e.target.value })} />
                </Field>
                {editing.id && (
                  <div className="sm:col-span-2 border-t border-line">
                    <Toggle
                      label="Aktif"
                      description="Vendor nonaktif tidak muncul lagi saat mencatat pembelian baru."
                      checked={editing.status === "atv"}
                      onChange={(aktif) => setEditing({ ...editing, status: aktif ? "atv" : "ina" })}
                    />
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saveMutation.isPending || !editing?.code.trim() || !editing?.name.trim()}>
                Simpan vendor
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.name}?`}
        message="Vendor hilang dari pilihan saat mencatat pembelian umum baru."
        details="Pembelian yang sudah tercatat dengan vendor ini tetap tersimpan."
        confirmLabel="Hapus vendor"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </>
  );
}
