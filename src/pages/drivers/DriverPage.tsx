import { scopeKey } from "@/mocks/scope";
import { useState } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Download, Pencil, Plus, Trash2, Truck } from "lucide-react";
import {
  createOrUpdateDriver,
  exportDrivers,
  getDrivers,
  removeDriver,
  type DriverView,
} from "@/features/drivers/api/driverApi";
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
import { cn } from "@/lib/utils";
import { formatNumber, formatPercentId } from "@/lib/format";
import type { DriverStatusEntity } from "@/mocks/types";
import { unitLabel } from "@/lib/lexicon";

const STATUSES: (DriverStatusEntity | "Semua")[] = [
  "Semua",
  "Standby",
  "Dalam Perjalanan",
  "Bongkar Muat",
  "Selesai",
  "Cuti",
];

interface FormState {
  id?: string;
  kode: string;
  nama: string;
  telepon: string;
  nomorSim: string;
  status: DriverStatusEntity;
  // Provisions the driver's mobile-app login. Read only on create: a driver is
  // always a person, and a person here is always a user, so registering one
  // now creates the other in the same step instead of leaving an account to be
  // wired up separately from the Users page.
  akunUsername: string;
  akunEmail: string;
  akunPassword: string;
}

const EMPTY: FormState = {
  kode: "",
  nama: "",
  telepon: "",
  nomorSim: "",
  status: "Standby",
  akunUsername: "",
  akunEmail: "",
  akunPassword: "",
};

export function DriverPage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<DriverStatusEntity | "Semua">("Semua");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<DriverView | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const list = useQuery({
    queryKey: [...scopeKey(), "drivers", search, status],
    queryFn: () => getDrivers({ search, status }),
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: FormState) => createOrUpdateDriver(values),
    errorTitle: "Data driver tidak tersimpan",
    success: (d) => ({ title: `${d.nama} tersimpan` }),
    onDone: () => setEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => removeDriver(id),
    errorTitle: "Hapus driver gagal",
    success: "Armada dihapus",
    onDone: () => setPendingDelete(null),
  });

  const exportMutation = useDeskMutation({
    mutationFn: () => exportDrivers(),
    errorTitle: "Unduh gagal",
    success: (count) => ({
      title: "Berkas CSV diunduh",
      description: `${count} driver diekspor.`,
    }),
  });

  const rows = list.data ?? [];

  /** Opening the editor is what clears stale validation, not an effect. */
  const openEditor = (values: FormState) => {
    setErrors({});
    setEditing(values);
  };
  const bertugas = rows.filter((d) => d.tugasHariIni > 0).length;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const next: typeof errors = {};
    if (!editing.nama.trim()) next.nama = "Nama driver wajib diisi.";
    if (!editing.kode.trim()) next.kode = "Kode driver wajib diisi.";
    if (!editing.telepon.trim()) next.telepon = "Nomor telepon wajib diisi.";
    // Only on create: an existing driver's login is managed from the Users
    // page, not re-issued by editing the driver record.
    if (!editing.id) {
      if (!editing.akunUsername.trim()) next.akunUsername = "Username wajib diisi.";
      if (!editing.akunPassword.trim()) next.akunPassword = "Kata sandi wajib diisi.";
      else if (editing.akunPassword.length < 8)
        next.akunPassword = "Kata sandi minimal 8 karakter.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(editing);
  };

  const columns: Column<DriverView>[] = [
    {
      key: "nama",
      header: "Driver",
      render: (row) => (
        <>
          <Link
            to={`/drivers/${row.id}`}
            className="block font-medium text-ink hover:underline hover:decoration-signal hover:decoration-2 hover:underline-offset-4"
          >
            {row.nama}
          </Link>
          <span className="data block text-2xs text-ink-muted">{row.telepon}</span>
        </>
      ),
      sortValue: (row) => row.nama,
    },
    {
      key: "muatan",
      header: "Muatan hari ini",
      width: "12rem",
      // A load, not a utilisation. Utilisation needs a ceiling, a ceiling is a
      // truck's capacity, and a driver has no truck of their own -- which one
      // they are out in is a fact about today's run. The meter moved to the
      // fleet list, where the capacity actually lives.
      render: (row) =>
        row.statistikTersedia ? (
          <span className="data text-ink">
            {formatNumber(row.muatanHariIni)}
            <span className="text-ink-muted"> {unitLabel()}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-muted">Belum tersedia</span>
        ),
      sortValue: (row) => row.muatanHariIni,
    },
    {
      key: "tugas",
      header: "Singgah hari ini",
      align: "right",
      // Counted from core.deliveries. "0 / 0" would report a driver who was
      // given nothing today, which is a claim this build cannot make.
      render: (row) =>
        row.statistikTersedia ? (
          <span className="data text-ink">
            {formatNumber(row.selesaiHariIni)}
            <span className="text-ink-muted"> / {formatNumber(row.tugasHariIni)}</span>
          </span>
        ) : (
          <span className="text-xs text-ink-muted">—</span>
        ),
      sortValue: (row) => row.tugasHariIni,
    },
    {
      key: "kinerja",
      header: "30 hari",
      align: "right",
      // Likewise. "0 · 0% tepat" reads as a driver with a perfect record of
      // having done nothing, which is worse than saying nothing at all.
      render: (row) =>
        row.statistikTersedia ? (
          <>
            <span className="data block text-ink">{formatNumber(row.unit30Hari)}</span>
            <span className="data block text-2xs text-ink-muted">
              {formatPercentId(row.ketepatan * 100)} tepat
            </span>
          </>
        ) : (
          <span className="text-xs text-ink-muted">—</span>
        ),
      sortValue: (row) => row.unit30Hari,
    },
    {
      key: "status",
      header: "Status",
      width: "9rem",
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
            aria-label={`Ubah ${row.nama}`}
            onClick={() =>
              openEditor({
                id: row.id,
                kode: row.kode,
                nama: row.nama,
                telepon: row.telepon,
                nomorSim: row.nomorSim,
                status: row.status,
                akunUsername: "",
                akunEmail: "",
                akunPassword: "",
              })
            }
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Hapus ${row.nama}`}
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
        title="Driver"
        description="Pengemudi yang dapat ditugaskan. Armada dan kapasitasnya ada di daftar Armada — pasangan driver dan kendaraan ditetapkan per rit di papan berangkat."
        actions={
          <>
            <Button
              variant="outline"
              onClick={() => exportMutation.mutate(undefined as never)}
              disabled={exportMutation.isPending}
            >
              <Download className="h-3.5 w-3.5" />
              Unduh CSV
            </Button>
            <Button onClick={() => openEditor(EMPTY)}>
              <Plus className="h-3.5 w-3.5" />
              Tambah driver
            </Button>
          </>
        }
        meta={
          <span className="text-xs text-ink-muted">
            <span className="data">{bertugas}</span> dari{" "}
            <span className="data">{rows.length}</span> driver bertugas hari ini
          </span>
        }
      />

      <Panel>
        <PanelHeader
          title="Daftar driver"
          hint={`${rows.length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Nama, kode, atau nomor SIM"
                className="w-56"
              />
              <SegmentedControl
                value={status}
                onChange={setStatus}
                options={STATUSES.map((s) => ({ value: s, label: s }))}
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
          pageSize={12}
          defaultSortKey="nama"
          emptyIcon={Truck}
          emptyMessage="Tidak ada driver yang cocok"
          emptyDescription="Ubah filter, atau tambahkan pengemudi baru ke daftar."
          emptyAction={
            <Button size="sm" onClick={() => openEditor(EMPTY)}>
              Tambah driver
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
                {editing?.id ? `Ubah ${editing.nama}` : "Tambah driver"}
              </DialogTitle>
              <DialogDescription>
                Data pengemudi. Kendaraan dan kapasitasnya didaftarkan di Armada,
                dan dipasangkan dengan driver saat rit disusun.
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                <Field
                  label="Nama driver"
                  htmlFor="d-nama"
                  error={errors.nama}
                  required
                  className="sm:col-span-2"
                >
                  <TextInput
                    id="d-nama"
                    value={editing.nama}
                    invalid={!!errors.nama}
                    onChange={(e) => setEditing({ ...editing, nama: e.target.value })}
                  />
                </Field>

                {/*
                  The depot's own reference. Required by the service and unique
                  per tenant -- it is what a dispatcher writes on a run sheet
                  and reads back, and it had no field here because the mock
                  never needed one.
                */}
                <Field label="Kode" htmlFor="d-kode" error={errors.kode} required>
                  <TextInput
                    id="d-kode"
                    mono
                    placeholder="DRV-0001"
                    value={editing.kode}
                    invalid={!!errors.kode}
                    onChange={(e) => setEditing({ ...editing, kode: e.target.value })}
                  />
                </Field>

                {/* Required by the service, which also validates the format —
                    an unreachable driver is not a record worth keeping. */}
                <Field label="Telepon" htmlFor="d-telp" error={errors.telepon} required>
                  <TextInput
                    id="d-telp"
                    mono
                    inputMode="tel"
                    value={editing.telepon}
                    onChange={(e) => setEditing({ ...editing, telepon: e.target.value })}
                  />
                </Field>

                <Field label="Nomor SIM" htmlFor="d-sim">
                  <TextInput
                    id="d-sim"
                    mono
                    value={editing.nomorSim}
                    onChange={(e) => setEditing({ ...editing, nomorSim: e.target.value })}
                  />
                </Field>


                <Field label="Status" htmlFor="d-status">
                  <SelectInput
                    id="d-status"
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        status: e.target.value as DriverStatusEntity,
                      })
                    }
                  >
                    <option value="Standby">Standby — siap ditugaskan</option>
                    <option value="Cuti">Cuti — tidak dapat dipilih</option>
                  </SelectInput>
                </Field>

                {/*
                  Create-only: a driver is always a person, and a person here
                  is always a user, so registering one provisions their
                  mobile-app login in the same step. An existing driver's
                  account is managed from the Users page instead.
                */}
                {!editing.id && (
                  <div className="sm:col-span-2 space-y-4 rounded-lg border border-line bg-panel-sunk p-4">
                    <p className="text-xs text-ink-muted">
                      Akun login aplikasi mobile untuk driver ini akan dibuat sekaligus.
                    </p>
                    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                      <Field
                        label="Username"
                        htmlFor="d-akun-username"
                        error={errors.akunUsername}
                        required
                      >
                        <TextInput
                          id="d-akun-username"
                          mono
                          value={editing.akunUsername}
                          invalid={!!errors.akunUsername}
                          onChange={(e) =>
                            setEditing({ ...editing, akunUsername: e.target.value })
                          }
                        />
                      </Field>

                      <Field label="Email" htmlFor="d-akun-email">
                        <TextInput
                          id="d-akun-email"
                          type="email"
                          value={editing.akunEmail}
                          onChange={(e) =>
                            setEditing({ ...editing, akunEmail: e.target.value })
                          }
                        />
                      </Field>

                      <Field
                        label="Kata sandi"
                        htmlFor="d-akun-password"
                        error={errors.akunPassword}
                        required
                        className="sm:col-span-2"
                      >
                        <TextInput
                          id="d-akun-password"
                          type="password"
                          value={editing.akunPassword}
                          invalid={!!errors.akunPassword}
                          onChange={(e) =>
                            setEditing({ ...editing, akunPassword: e.target.value })
                          }
                        />
                      </Field>
                    </div>
                  </div>
                )}
              </div>
            )}

            <DialogFooter>
              <Button variant="outline" type="button" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                Simpan driver
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.nama}?`}
        message="Armada hilang dari daftar penugasan pada rencana distribusi berikutnya."
        details={
          pendingDelete && (
            <p className={cn(pendingDelete.tugasHariIni > 0 && "text-rust-ink")}>
              {pendingDelete.tugasHariIni > 0
                ? `Masih memegang ${pendingDelete.tugasHariIni} surat jalan hari ini. Tugaskan ulang sebelum menghapus.`
                : "Riwayat pengiriman tetap tersimpan untuk laporan kinerja."}
            </p>
          )
        }
        confirmLabel="Hapus armada"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
