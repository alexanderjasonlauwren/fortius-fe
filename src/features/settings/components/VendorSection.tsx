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
import { Field, SearchInput, TextInput, Toggle } from "@/components/common/Field";
import { vendorMatches } from "@/features/suppliers/lib/search";
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
  email: string;
  contactPerson: string;
  /** Blank means no default term: a bill is due on its own date. */
  paymentTermsDays: string;
  bankName: string;
  bankAccountNumber: string;
  bankAccountHolder: string;
  status: "atv" | "ina";
}

const EMPTY: VendorForm = {
  code: "", name: "", npwp: "", address: "", phone: "", email: "", contactPerson: "", paymentTermsDays: "",
  bankName: "", bankAccountNumber: "", bankAccountHolder: "", status: "atv",
};

/** The form's contact, terms and bank fields as the API takes them. On an
 *  edit a blank is sent, which clears the field; terms stay as they are when
 *  blank, since 0 is a real term (due on receipt). */
function details(v: VendorForm, editing: boolean) {
  const text = (s: string) => (editing ? s : s.trim() || undefined);
  return {
    email: text(v.email),
    contactPerson: text(v.contactPerson),
    paymentTermsDays: v.paymentTermsDays.trim() === "" ? undefined : Number(v.paymentTermsDays),
    bankName: text(v.bankName),
    bankAccountNumber: text(v.bankAccountNumber),
    bankAccountHolder: text(v.bankAccountHolder),
  };
}

export function VendorSection() {
  const list = useQuery({ queryKey: [...scopeKey(), "vendors"], queryFn: getVendors });
  const [editing, setEditing] = useState<VendorForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VendorView | null>(null);
  const [search, setSearch] = useState("");
  const rows = (list.data ?? []).filter((v) => vendorMatches(v, search));

  const saveMutation = useDeskMutation({
    mutationFn: (values: VendorForm) =>
      values.id
        ? updateVendor({
            id: values.id,
            version: values.version!,
            name: values.name,
            npwp: values.npwp,
            address: values.address,
            phone: values.phone,
            ...details(values, true),
            status: values.status,
          })
        : createVendor({
            code: values.code,
            name: values.name,
            npwp: values.npwp || undefined,
            address: values.address || undefined,
            phone: values.phone || undefined,
            ...details(values, false),
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
        ? {
            id: row.id, version: row.version, code: row.code, name: row.name, npwp: row.npwp ?? "", address: row.address ?? "",
            phone: row.phone ?? "", email: row.email ?? "", contactPerson: row.contactPerson ?? "",
            paymentTermsDays: row.paymentTermsDays != null ? String(row.paymentTermsDays) : "",
            bankName: row.bankName ?? "", bankAccountNumber: row.bankAccountNumber ?? "", bankAccountHolder: row.bankAccountHolder ?? "",
            status: row.status,
          }
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
          <span className="block text-xs text-ink">{row.contactPerson || "—"}</span>
          <span className="data block text-2xs text-ink-muted">{[row.phone, row.email].filter(Boolean).join(" · ") || "—"}</span>
        </>
      ),
    },
    {
      key: "bayar", header: "Pembayaran",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">{row.paymentTermsDays != null ? `Net ${row.paymentTermsDays} hari` : "—"}</span>
          <span className="data block text-2xs text-ink-muted">{row.bankName ? `${row.bankName} ${row.bankAccountNumber ?? ""}` : ""}</span>
        </>
      ),
    },
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
          hint="Dipakai saat mencatat pembelian umum (bukan lewat SA)."
          actions={
            <div className="flex items-center gap-2">
              <SearchInput value={search} onChange={setSearch} placeholder="Nama, kode, kontak" className="w-48" />
              <Button size="sm" onClick={() => open()}>
                <Plus className="h-3.5 w-3.5" />
                Tambah vendor
              </Button>
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={rows}
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
              <DialogDescription>Vendor pembelian umum, terpisah dari pemasok SA.</DialogDescription>
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
                <Field label="Kontak" htmlFor="vnd-contact">
                  <TextInput id="vnd-contact" maxLength={200} value={editing.contactPerson} onChange={(e) => setEditing({ ...editing, contactPerson: e.target.value })} />
                </Field>
                <Field label="Email" htmlFor="vnd-email">
                  <TextInput id="vnd-email" type="email" maxLength={255} value={editing.email} onChange={(e) => setEditing({ ...editing, email: e.target.value })} />
                </Field>
                <Field label="Termin bayar (hari)" htmlFor="vnd-terms" hint="Jatuh tempo tagihan baru = tanggal tagihan + termin.">
                  <TextInput id="vnd-terms" type="number" min={0} max={365} mono value={editing.paymentTermsDays}
                    onChange={(e) => setEditing({ ...editing, paymentTermsDays: e.target.value })} />
                </Field>
                <Field label="Bank" htmlFor="vnd-bank">
                  <TextInput id="vnd-bank" maxLength={100} value={editing.bankName} placeholder="BCA" onChange={(e) => setEditing({ ...editing, bankName: e.target.value })} />
                </Field>
                <Field label="No. rekening" htmlFor="vnd-acct">
                  <TextInput id="vnd-acct" mono maxLength={50} value={editing.bankAccountNumber} onChange={(e) => setEditing({ ...editing, bankAccountNumber: e.target.value })} />
                </Field>
                <Field label="Atas nama" htmlFor="vnd-holder">
                  <TextInput id="vnd-holder" maxLength={200} value={editing.bankAccountHolder} onChange={(e) => setEditing({ ...editing, bankAccountHolder: e.target.value })} />
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
              <Button type="submit" disabled={saveMutation.isPending || !editing?.code.trim() || !editing?.name.trim() ||
                (!!editing?.paymentTermsDays.trim() && !(Number(editing.paymentTermsDays) >= 0 && Number(editing.paymentTermsDays) <= 365))}>
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
