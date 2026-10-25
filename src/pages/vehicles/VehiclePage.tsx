import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { AlertTriangle, Pencil, Plus, Trash2, Truck } from "lucide-react";
import {
  createOrUpdateVehicle,
  getVehicles,
  removeVehicle,
  type VehicleView,
} from "@/features/vehicles/api/vehicleApi";
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
import { formatDateId, formatNumber } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";
import type { VehicleStatusEntity } from "@/types/domain";

const STATUSES: (VehicleStatusEntity | "Semua")[] = ["Semua", "Aktif", "Perawatan", "Nonaktif"];

interface FormState {
  id?: string;
  plat: string;
  armada: string;
  kapasitas: number;
  status: VehicleStatusEntity;
}

const EMPTY: FormState = { plat: "", armada: "", kapasitas: 240, status: "Aktif" };

/**
 * The fleet.
 *
 * A page of its own because the service serves two lists: `core.drivers` and
 * `core.vehicles` have no link column, and the pairing lives on a run. The
 * console used to hide the fleet inside the driver form — a plate and a
 * capacity on the person driving — which meant a truck could not be recorded
 * without inventing a driver for it, and a driver's capacity changed the day
 * they took a different truck.
 */
export function VehiclePage() {
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState<VehicleStatusEntity | "Semua">("Semua");
  const [editing, setEditing] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<VehicleView | null>(null);
  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const list = useQuery({
    queryKey: [...scopeKey(), "vehicles", search, status],
    queryFn: () => getVehicles({ search, status }),
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: FormState) => createOrUpdateVehicle(values),
    errorTitle: "Data armada tidak tersimpan",
    success: (v) => ({ title: `${v.plat} tersimpan` }),
    onDone: () => setEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => removeVehicle(id),
    errorTitle: "Hapus armada gagal",
    success: "Armada dihapus",
    onDone: () => setPendingDelete(null),
  });

  const openEditor = (state: FormState) => {
    setErrors({});
    setEditing(state);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const next: typeof errors = {};
    if (!editing.plat.trim()) next.plat = "Nomor plat wajib diisi.";
    if (editing.kapasitas <= 0) next.kapasitas = "Kapasitas harus lebih dari nol.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(editing);
  };

  const rows = list.data ?? [];
  const perluPerhatian = rows.filter((v) => v.perluPerhatian);

  const columns: Column<VehicleView>[] = [
    {
      key: "plat",
      header: "Armada",
      render: (row) => (
        <>
          <span className="data block text-xs text-ink">{row.plat}</span>
          <span className="block text-2xs text-ink-muted">{row.armada}</span>
        </>
      ),
      sortValue: (row) => row.plat,
    },
    {
      key: "kapasitas",
      header: "Kapasitas",
      render: (row) => (
        <span className="data text-ink">
          {formatNumber(row.kapasitas)}
          <span className="text-ink-muted"> {unitLabel()}</span>
          {row.kapasitasKg !== undefined && (
            <span className="block text-2xs text-ink-muted">
              {formatNumber(row.kapasitasKg)} kg
            </span>
          )}
        </span>
      ),
      sortValue: (row) => row.kapasitas,
    },
    {
      key: "dokumen",
      header: "STNK / KIR",
      // The two certificates that make a truck legal to run. Absent is shown as
      // a dash rather than as "aman": nobody has recorded the date, which is
      // not the same as the date being far away.
      render: (row) => (
        <span className="text-2xs text-ink-muted">
          <span className="block">
            STNK {row.stnkBerakhir ? formatDateId(row.stnkBerakhir) : "—"}
          </span>
          <span className="block">
            KIR {row.kirBerakhir ? formatDateId(row.kirBerakhir) : "—"}
          </span>
        </span>
      ),
    },
    {
      key: "status",
      header: "Status",
      render: (row) => (
        <div className="flex items-center gap-2">
          <StatusBadge variant={getStatusVariant(row.status)} label={row.status} />
          {row.perluPerhatian && (
            <span title="STNK atau KIR akan berakhir dalam 30 hari">
              <AlertTriangle className="h-3.5 w-3.5 text-signal-ink" />
            </span>
          )}
        </div>
      ),
      sortValue: (row) => row.status,
    },
    {
      key: "aksi",
      header: "",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Ubah ${row.plat}`}
            onClick={() =>
              openEditor({
                id: row.id,
                plat: row.plat,
                armada: row.armada,
                kapasitas: row.kapasitas,
                status: row.status,
              })
            }
          >
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button
            variant="ghost"
            size="icon-xs"
            aria-label={`Hapus ${row.plat}`}
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
        title="Armada"
        description="Kendaraan yang dapat dimuati, kapasitas angkutnya, dan masa berlaku dokumennya. Sopir ditetapkan per rit di papan berangkat."
        actions={
          <Button onClick={() => openEditor(EMPTY)}>
            <Plus className="h-3.5 w-3.5" />
            Tambah armada
          </Button>
        }
        meta={
          <span className="text-xs text-ink-muted">
            <span className="data">{rows.length}</span> armada terdaftar
            {perluPerhatian.length > 0 && (
              <>
                {" · "}
                <span className="text-signal-ink">
                  <span className="data">{perluPerhatian.length}</span> dokumen segera
                  berakhir
                </span>
              </>
            )}
          </span>
        }
      />

      <Panel>
        <PanelHeader
          title="Daftar armada"
          hint={`${rows.length} baris`}
          actions={
            <div className="flex flex-wrap items-center gap-2">
              <SearchInput
                value={search}
                onChange={setSearch}
                placeholder="Plat atau jenis armada"
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
          defaultSortKey="plat"
          emptyIcon={Truck}
          emptyMessage="Tidak ada armada yang cocok"
          emptyDescription="Ubah filter, atau tambahkan kendaraan baru ke daftar."
          emptyAction={
            <Button size="sm" onClick={() => openEditor(EMPTY)}>
              Tambah armada
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
                {editing?.id ? `Ubah ${editing.plat}` : "Tambah armada"}
              </DialogTitle>
              <DialogDescription>
                Kapasitas menentukan berapa banyak yang boleh dimuat dalam satu rit.
              </DialogDescription>
            </DialogHeader>

            {editing && (
              <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
                <Field label="Nomor plat" htmlFor="v-plat" error={errors.plat} required>
                  <TextInput
                    id="v-plat"
                    mono
                    placeholder="H 1234 AB"
                    value={editing.plat}
                    invalid={!!errors.plat}
                    onChange={(e) => setEditing({ ...editing, plat: e.target.value })}
                  />
                </Field>

                <Field label="Jenis armada" htmlFor="v-armada">
                  <TextInput
                    id="v-armada"
                    placeholder="Isuzu Elf NMR"
                    value={editing.armada}
                    onChange={(e) => setEditing({ ...editing, armada: e.target.value })}
                  />
                </Field>

                <Field
                  label="Kapasitas"
                  htmlFor="v-kap"
                  error={errors.kapasitas}
                  hint={`Jumlah ${unitLabel()} per rit.`}
                  required
                >
                  {/* step="any": see OutletFormPage — `step` is a validity
                      constraint, and a spinner increment there silently refused
                      ordinary round numbers. */}
                  <TextInput
                    id="v-kap"
                    type="number"
                    min={1}
                    step="any"
                    mono
                    value={editing.kapasitas}
                    invalid={!!errors.kapasitas}
                    onChange={(e) =>
                      setEditing({ ...editing, kapasitas: Number(e.target.value) })
                    }
                  />
                </Field>

                <Field label="Status" htmlFor="v-status">
                  <SelectInput
                    id="v-status"
                    value={editing.status}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        status: e.target.value as VehicleStatusEntity,
                      })
                    }
                  >
                    <option value="Aktif">Aktif (siap dimuati)</option>
                    <option value="Perawatan">Perawatan (sedang di bengkel)</option>
                    <option value="Nonaktif">Nonaktif (tidak dipakai)</option>
                  </SelectInput>
                </Field>
              </div>
            )}

            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                Batal
              </Button>
              <Button type="submit" disabled={saveMutation.isPending}>
                Simpan
              </Button>
            </DialogFooter>
          </form>
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={!!pendingDelete}
        title={`Hapus ${pendingDelete?.plat ?? "armada"}?`}
        message="Armada ini tidak lagi muncul saat menetapkan rit. Riwayat rit yang sudah berjalan tetap tersimpan."
        confirmLabel="Hapus"
        variant="destructive"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
