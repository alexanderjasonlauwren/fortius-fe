import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Pencil, Trash2, UserPlus, Users } from "lucide-react";
import {
  createOrUpdateUser,
  getUsersWithAccess,
  removeUser,
  ROLE_LABEL,
  ROLE_SUMMARY,
} from "@/features/users/api/userApi";
import { describeRoles } from "@/features/rbac/access";
import { getDrivers } from "@/features/drivers/api/driverApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { getStatusVariant, spineFor } from "@/lib/status";
import { Field, SearchInput, SegmentedControl, SelectInput, TextInput } from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatDateTimeId, relativeTime } from "@/lib/format";
import type { UserEntity } from "@/types/domain";

type Role = UserEntity["role"];
const ROLES: Role[] = ["admin", "manager", "finance", "staff", "viewer", "driver"];

interface FormState {
  id?: string;
  nama: string;
  email: string;
  role: Role;
  telepon: string;
  cabang: string;
  /** Which truck a `driver` account drives. */
  driverId?: string;
}

const EMPTY: FormState = {
  nama: "",
  email: "",
  role: "staff",
  telepon: "",
  cabang: "Pool Salatiga",
};

export function UserListPage() {
  const [search, setSearch] = useState("");
  const [role, setRole] = useState<Role | "Semua">("Semua");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<UserEntity | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const list = useQuery({
    queryKey: [...scopeKey(), "users", search, role],
    queryFn: () => getUsersWithAccess({ search, role }),
  });
  // Only needed while assigning a sopir, so it is not fetched until then.
  const fleet = useQuery({
    queryKey: [...scopeKey(), "drivers", "", "Semua"],
    queryFn: () => getDrivers(),
    enabled: editing?.role === "driver",
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: FormState) => createOrUpdateUser(values),
    errorTitle: "Akun tidak tersimpan",
    success: (u) => ({
      title: u.status === "Diundang" ? `Undangan dikirim ke ${u.email}` : `${u.nama} diperbarui`,
    }),
    onDone: () => setEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => removeUser(id),
    errorTitle: "Hapus akun gagal",
    success: "Akun dihapus",
    onDone: () => setPendingDelete(null),
  });

  const rows = list.data ?? [];

  /** Opening the editor is what clears stale validation, not an effect. */
  const openEditor = (values: FormState) => {
    setErrors({});
    setEditing(values);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const next: typeof errors = {};
    if (!editing.nama.trim()) next.nama = "Nama wajib diisi.";
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(editing.email))
      next.email = "Masukkan alamat email yang valid.";
    if (editing.role === "driver" && !editing.driverId)
      next.driverId = "Pilih armada yang dikemudikan akun ini.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(editing);
  };

  const columns: Column<UserEntity>[] = [
    {
      key: "nama",
      header: "Pengguna",
      render: (row) => (
        <>
          <span className="block font-medium text-ink">{row.nama}</span>
          <span className="data block text-2xs text-ink-muted">{row.email}</span>
        </>
      ),
      sortValue: (row) => row.nama,
    },
    {
      key: "role",
      header: "Peran",
      render: (row) => (
        <>
          <span className="block text-xs font-medium text-ink">
            {describeRoles(row.roleNames)}
          </span>
          <span className="block max-w-[18rem] text-2xs leading-snug text-ink-muted">
            {row.roleNames?.length
              ? row.cabang || "Cakupan akses belum ditentukan."
              : "Belum ada akses yang diberikan."}
          </span>
        </>
      ),
      sortValue: (row) => row.role,
    },
    {
      key: "cabang",
      header: "Cabang",
      render: (row) => (
        <>
          <span className="block text-xs text-ink">{row.cabang}</span>
          <span className="data block text-2xs text-ink-muted">{row.telepon}</span>
        </>
      ),
      sortValue: (row) => row.cabang,
    },
    {
      key: "masuk",
      header: "Terakhir masuk",
      render: (row) => (
        <span
          className="data text-xs text-ink-muted"
          title={row.terakhirMasuk ? formatDateTimeId(row.terakhirMasuk) : undefined}
        >
          {row.terakhirMasuk ? relativeTime(row.terakhirMasuk) : "Belum pernah"}
        </span>
      ),
      sortValue: (row) => row.terakhirMasuk ?? "",
    },
    {
      key: "status",
      header: "Status",
      width: "8rem",
      render: (row) => (
        <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
      ),
      sortValue: (row) => row.status,
    },
    {
      key: "aksi",
      header: "",
      align: "right",
      width: "1%",
      render: (row) => (
        <div className="flex items-center justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Ubah akun ${row.nama}`}
            onClick={() =>
              openEditor({
                id: row.id,
                nama: row.nama,
                email: row.email,
                role: row.role,
                telepon: row.telepon,
                cabang: row.cabang,
                driverId: row.driverId,
              })
            }
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Hapus akun ${row.nama}`}
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
    <div className="space-y-5">
      <PageHeader
        eyebrow="Data induk"
        title="Pengguna & Akses"
        description="Siapa yang boleh melakukan apa di konsol ini."
        actions={
          <Button onClick={() => openEditor(EMPTY)}>
            <UserPlus className="h-3.5 w-3.5" />
            Undang pengguna
          </Button>
        }
      />

      <Panel>
        <PanelHeader
          title="Daftar pengguna"
          hint={`${rows.length} akun`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Nama, email, atau cabang"
                className="w-52"
              />
              <SegmentedControl
                value={role}
                onChange={setRole}
                options={[
                  { value: "Semua" as const, label: "Semua" },
                  ...ROLES.map((r) => ({ value: r, label: ROLE_LABEL[r] })),
                ]}
              />
            </div>
          }
        />
        <DataTable
          columns={columns}
          data={rows}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          spineFor={(row) => spineFor(row.status)}
          pageSize={10}
          defaultSortKey="nama"
          emptyIcon={Users}
          emptyMessage="Tidak ada pengguna yang cocok"
          emptyDescription="Ubah filter, atau undang anggota tim baru."
          emptyAction={
            <Button size="sm" onClick={() => openEditor(EMPTY)}>
              Undang pengguna
            </Button>
          }
          dense
        />
      </Panel>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-lg">
          <form onSubmit={submit}>
            <DialogHeader>
              <DialogTitle>
                {editing?.id ? `Ubah akses ${editing.nama}` : "Undang pengguna"}
              </DialogTitle>
              <DialogDescription>
                {editing?.id
                  ? "Perubahan peran berlaku pada sesi berikutnya pengguna masuk."
                  : "Pengguna baru berstatus diundang sampai mereka masuk untuk pertama kali."}
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field label="Nama" htmlFor="u-nama" error={errors.nama} required>
                  <TextInput
                    id="u-nama"
                    value={editing.nama}
                    invalid={!!errors.nama}
                    onChange={(e) => setEditing({ ...editing, nama: e.target.value })}
                  />
                </Field>

                <Field label="Email" htmlFor="u-email" error={errors.email} required>
                  <TextInput
                    id="u-email"
                    type="email"
                    mono
                    value={editing.email}
                    invalid={!!errors.email}
                    onChange={(e) => setEditing({ ...editing, email: e.target.value })}
                  />
                </Field>

                <Field
                  label="Peran"
                  htmlFor="u-role"
                  hint={ROLE_SUMMARY[editing.role]}
                  className="sm:col-span-2"
                >
                  <SelectInput
                    id="u-role"
                    value={editing.role}
                    onChange={(e) =>
                      setEditing({ ...editing, role: e.target.value as Role })
                    }
                  >
                    {ROLES.map((r) => (
                      <option key={r} value={r}>
                        {ROLE_LABEL[r]}
                      </option>
                    ))}
                  </SelectInput>
                </Field>

                {editing.role === "driver" && (
                  <Field
                    label="Armada yang dikemudikan"
                    htmlFor="u-armada"
                    error={errors.driverId}
                    hint="Menentukan rute siapa yang dibuka akun ini di halaman Rute Saya."
                    required
                    className="sm:col-span-2"
                  >
                    <SelectInput
                      id="u-armada"
                      value={editing.driverId ?? ""}
                      invalid={!!errors.driverId}
                      onChange={(e) =>
                        setEditing({ ...editing, driverId: e.target.value || undefined })
                      }
                    >
                      <option value="">Pilih armada</option>
                      {(fleet.data ?? []).map((d) => (
                        <option key={d.id} value={d.id}>
                          {d.nama} — {d.nomorSim}
                        </option>
                      ))}
                    </SelectInput>
                  </Field>
                )}

                <Field label="Telepon" htmlFor="u-telp">
                  <TextInput
                    id="u-telp"
                    mono
                    inputMode="tel"
                    value={editing.telepon}
                    onChange={(e) => setEditing({ ...editing, telepon: e.target.value })}
                  />
                </Field>

                <Field label="Cabang" htmlFor="u-cabang">
                  <TextInput
                    id="u-cabang"
                    value={editing.cabang}
                    onChange={(e) => setEditing({ ...editing, cabang: e.target.value })}
                  />
                </Field>
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                {editing?.id ? "Simpan perubahan" : "Kirim undangan"}
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus akun ${pendingDelete?.nama}?`}
        message="Pengguna kehilangan akses ke konsol seketika."
        details="Jejak aktivitas yang sudah tercatat atas nama mereka tetap tersimpan."
        confirmLabel="Hapus akun"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
