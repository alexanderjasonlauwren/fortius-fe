/**
 * Admin CRUD for the tenant's own expense categories (gap-closing plan,
 * Phase F) -- `core.expenses.category` is a composite FK into this table's
 * own `code`, so this screen is what gives the expense form's picker
 * anything beyond the twelve categories a tenant starts with.
 */
import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Plus, Tags, Trash2 } from "lucide-react";
import {
  createExpenseCategory,
  deleteExpenseCategory,
  getExpenseCategories,
  updateExpenseCategory,
  type ExpenseCategoryView,
} from "@/features/expensecategories/api/expenseCategoryApi";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import { leafAccounts } from "@/features/finance/lib/accounts";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, SelectInput, TextInput, Toggle } from "@/components/common/Field";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";

interface CategoryForm {
  id?: string;
  version?: number;
  code: string;
  name: string;
  accountId: string;
  groupLabel: string;
  sortOrder: number;
  status: "atv" | "ina";
}

const EMPTY: CategoryForm = { code: "", name: "", accountId: "", groupLabel: "", sortOrder: 0, status: "atv" };

export function ExpenseCategorySection() {
  const list = useQuery({ queryKey: [...scopeKey(), "expense-categories"], queryFn: getExpenseCategories });
  const accounts = useQuery({ queryKey: [...scopeKey(), "chart-of-accounts"], queryFn: getChartOfAccounts });
  const postableAccounts = leafAccounts(accounts.data ?? []);
  const [editing, setEditing] = useState<CategoryForm | null>(null);
  const [pendingDelete, setPendingDelete] = useState<ExpenseCategoryView | null>(null);

  const saveMutation = useDeskMutation({
    mutationFn: (values: CategoryForm) =>
      values.id
        ? updateExpenseCategory({
            id: values.id,
            version: values.version!,
            name: values.name,
            accountId: values.accountId,
            groupLabel: values.groupLabel,
            sortOrder: values.sortOrder,
            status: values.status,
          })
        : createExpenseCategory({
            code: values.code,
            name: values.name,
            accountId: values.accountId,
            groupLabel: values.groupLabel,
            sortOrder: values.sortOrder,
          }),
    errorTitle: "Kategori tidak tersimpan",
    success: (row) => ({ title: `${row.name} tersimpan` }),
    onDone: () => setEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => deleteExpenseCategory(id),
    errorTitle: "Hapus kategori gagal",
    success: "Kategori dihapus",
    onDone: () => setPendingDelete(null),
  });

  const open = (row?: ExpenseCategoryView) => {
    setEditing(
      row
        ? {
            id: row.id,
            version: row.version,
            code: row.code,
            name: row.name,
            accountId: row.accountId,
            groupLabel: row.groupLabel,
            sortOrder: row.sortOrder,
            status: row.status,
          }
        : { ...EMPTY, sortOrder: (list.data?.length ?? 0) + 1 },
    );
  };

  const columns: Column<ExpenseCategoryView>[] = [
    {
      key: "name",
      header: "Kategori",
      render: (row) => (
        <>
          <span className="block font-medium text-ink">{row.name}</span>
          <span className="data block text-2xs text-ink-muted">{row.code}</span>
        </>
      ),
      sortValue: (row) => row.sortOrder,
    },
    { key: "group", header: "Kelompok", render: (row) => <span className="text-xs text-ink-muted">{row.groupLabel}</span> },
    { key: "account", header: "Akun", render: (row) => <span className="data text-xs text-ink-muted">{row.accountCode} · {row.accountName}</span> },
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
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Hapus ${row.name}`}
            onClick={() => setPendingDelete(row)}
            className="hover:bg-rust-soft hover:text-rust-ink"
          >
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
          title="Kategori Pengeluaran"
          hint="Dipakai saat mencatat pengeluaran. Kode tidak dapat diubah setelah dibuat."
          actions={
            <Button size="sm" onClick={() => open()}>
              <Plus className="h-3.5 w-3.5" />
              Tambah kategori
            </Button>
          }
        />
        <DataTable
          columns={columns}
          data={list.data ?? []}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => (row.status === "atv" ? "text-pine" : "text-draft")}
          emptyIcon={Tags}
          emptyMessage="Belum ada kategori pengeluaran"
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
              <DialogTitle>{editing?.id ? `Ubah ${editing.name}` : "Tambah kategori pengeluaran"}</DialogTitle>
              <DialogDescription>Setiap pengeluaran memposting jurnal ke akun kategori ini.</DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Kode" htmlFor="cat-code" required hint={editing.id ? "Tidak dapat diubah." : undefined}>
                  <TextInput
                    id="cat-code"
                    mono
                    disabled={!!editing.id}
                    value={editing.code}
                    placeholder="fuel"
                    onChange={(e) => setEditing({ ...editing, code: e.target.value })}
                  />
                </Field>
                <Field label="Nama" htmlFor="cat-name" required>
                  <TextInput
                    id="cat-name"
                    value={editing.name}
                    onChange={(e) => setEditing({ ...editing, name: e.target.value })}
                  />
                </Field>
                <Field label="Kelompok" htmlFor="cat-group" required hint="Mengelompokkan kategori pada pemilih formulir.">
                  <TextInput
                    id="cat-group"
                    value={editing.groupLabel}
                    placeholder="Biaya Logistik"
                    onChange={(e) => setEditing({ ...editing, groupLabel: e.target.value })}
                  />
                </Field>
                <Field label="Urutan" htmlFor="cat-sort">
                  <TextInput
                    id="cat-sort"
                    type="number"
                    min={0}
                    mono
                    value={editing.sortOrder}
                    onChange={(e) => setEditing({ ...editing, sortOrder: Number(e.target.value) })}
                  />
                </Field>
                <Field label="Akun" htmlFor="cat-account" required className="sm:col-span-2">
                  <SelectInput
                    id="cat-account"
                    value={editing.accountId}
                    onChange={(e) => setEditing({ ...editing, accountId: e.target.value })}
                  >
                    <option value="">— Pilih —</option>
                    {postableAccounts.map((a) => (
                      <option key={a.akun.id} value={a.akun.id}>{a.akun.kode} · {a.akun.nama}</option>
                    ))}
                  </SelectInput>
                </Field>
                {editing.id && (
                  <div className="sm:col-span-2 border-t border-line">
                    <Toggle
                      label="Aktif"
                      description="Kategori nonaktif tidak muncul lagi di formulir pengeluaran."
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
              <Button
                type="submit"
                disabled={saveMutation.isPending || !editing?.code.trim() || !editing?.name.trim() || !editing?.groupLabel.trim() || !editing?.accountId}
              >
                Simpan kategori
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.name}?`}
        message="Kategori hilang dari pilihan saat mencatat pengeluaran baru."
        details="Pengeluaran yang sudah tercatat dengan kategori ini tetap tersimpan."
        confirmLabel="Hapus kategori"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </>
  );
}
