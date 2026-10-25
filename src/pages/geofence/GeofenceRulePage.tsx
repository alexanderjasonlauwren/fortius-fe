import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { MapPin, Pencil, Plus, Trash2 } from "lucide-react";
import {
  createOrUpdateGeofenceRule,
  getGeofenceRules,
  removeGeofenceRule,
  type GeofenceRuleView,
  type GeofenceShapeEntity,
} from "@/features/geofence/api/geofenceApi";
import { FencePicker } from "@/features/geofence/components/FencePicker";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelHeader } from "@/components/common/Panel";
import { DataTable, type Column } from "@/components/common/DataTable";
import { ConfirmDialog } from "@/components/common/ConfirmDialog";
import { StatusBadge } from "@/components/common/StatusBadge";
import { Field, SelectInput, TextInput } from "@/components/common/Field";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatNumber } from "@/lib/format";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";

/** Salatiga's pool, where a new fence opens before anyone has clicked. */
const DEFAULT_CENTRE = { lat: -7.3305, lng: 110.5084 };

interface FormState {
  id?: string;
  kode: string;
  nama: string;
  keterangan: string;
  bentuk: GeofenceShapeEntity;
  subjek: GeofenceRuleView["subjek"];
  mode: GeofenceRuleView["mode"];
  keparahan: GeofenceRuleView["keparahan"];
}

const EMPTY: FormState = {
  kode: "",
  nama: "",
  keterangan: "",
  bentuk: { jenis: "Lingkaran", pusat: DEFAULT_CENTRE, radiusMeter: 500 },
  subjek: "Depot",
  mode: "Keluar",
  keparahan: "Peringatan",
};

function describeShape(shape: GeofenceShapeEntity): string {
  return shape.jenis === "Lingkaran"
    ? `Lingkaran · ${formatNumber(shape.radiusMeter)} m`
    : `Poligon · ${shape.batas.length} titik`;
}

/**
 * The fences, and where they are.
 *
 * # Why the shape cannot be changed after create
 *
 * `rule_type` is fixed by the service: an update carries no field for it, and
 * sending a boundary against a circle answers 422 naming the field. Swapping
 * one for the other is a different fence wearing the old one's code, so the
 * edit dialog shows the kind and does not offer to change it. Somebody who
 * needs the other shape makes a new rule.
 *
 * # What this screen does not claim
 *
 * A fence here guards nothing until a driver's own position stream reaches the
 * service — geofencing is evaluated from GPS fixes, and a driver who has not
 * switched recording on is never evaluated. The empty state on the alerts
 * panel says that rather than "all clear".
 */
export function GeofenceRulePage() {
  const [editing, setEditing] = useState<FormState | null>(null);
  const [pendingDelete, setPendingDelete] = useState<GeofenceRuleView | null>(null);
  const [errors, setErrors] = useState<Record<string, string>>({});

  const list = useQuery({
    queryKey: [...scopeKey(), "geofence-rules"],
    queryFn: () => getGeofenceRules(),
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: FormState) =>
      createOrUpdateGeofenceRule({
        id: values.id,
        kode: values.kode.trim(),
        nama: values.nama.trim(),
        keterangan: values.keterangan.trim() || undefined,
        bentuk: values.bentuk,
        subjek: values.subjek,
        mode: values.mode,
        keparahan: values.keparahan,
      }),
    errorTitle: "Aturan pagar tidak tersimpan",
    success: (rule) => ({ title: `${rule.nama} tersimpan` }),
    onDone: () => setEditing(null),
  });

  const deleteMutation = useDeskMutation({
    mutationFn: (id: string) => removeGeofenceRule(id),
    errorTitle: "Hapus aturan gagal",
    success: "Aturan pagar dihapus",
    onDone: () => setPendingDelete(null),
  });

  const openEditor = (state: FormState) => {
    setErrors({});
    setEditing(state);
  };

  const openFor = (rule: GeofenceRuleView) =>
    openEditor({
      id: rule.id,
      kode: rule.kode,
      nama: rule.nama,
      keterangan: rule.keterangan ?? "",
      bentuk: rule.bentuk,
      subjek: rule.subjek,
      mode: rule.mode,
      keparahan: rule.keparahan,
    });

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    const next: Record<string, string> = {};
    if (!editing.kode.trim()) next.kode = "Kode wajib diisi.";
    if (!editing.nama.trim()) next.nama = "Nama wajib diisi.";
    if (editing.bentuk.jenis === "Lingkaran" && editing.bentuk.radiusMeter <= 0) {
      next.radius = "Radius harus lebih dari nol.";
    }
    // The same rule ck_geofence_rules_shape enforces, said here so the person
    // drawing finds out while the map is in front of them.
    if (editing.bentuk.jenis === "Poligon" && editing.bentuk.batas.length < 3) {
      next.bentuk = "Poligon memerlukan minimal 3 titik.";
    }
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(editing);
  };

  const rows = list.data ?? [];

  const columns: Column<GeofenceRuleView>[] = [
    {
      key: "nama",
      header: "Aturan",
      sortValue: (row) => row.nama,
      render: (row) => (
        <div>
          <p className="font-semibold text-ink">{row.nama}</p>
          <p className="data text-2xs text-ink-muted">{row.kode}</p>
        </div>
      ),
    },
    {
      key: "bentuk",
      header: "Bentuk",
      render: (row) => <span className="text-xs text-ink-muted">{describeShape(row.bentuk)}</span>,
    },
    {
      key: "subjek",
      header: "Menjaga",
      sortValue: (row) => row.subjek,
      render: (row) => <span className="text-xs text-ink-muted">{row.subjek}</span>,
    },
    {
      key: "mode",
      header: "Picu",
      render: (row) => (
        <span className="text-xs text-ink-muted">
          {row.mode === "Masuk" ? "Saat memasuki area" : "Saat meninggalkan area"}
        </span>
      ),
    },
    {
      key: "keparahan",
      header: "Keparahan",
      render: (row) => (
        <StatusBadge
          variant={
            row.keparahan === "Kritis" ? "danger" : row.keparahan === "Info" ? "draft" : "warning"
          }
          label={row.keparahan}
        />
      ),
    },
    {
      key: "aksi",
      header: "",
      render: (row) => (
        <div className="flex justify-end gap-1">
          <CanAccess permission={PERMISSIONS.GEOFENCE_EDIT}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Ubah ${row.nama}`}
              onClick={() => openFor(row)}
            >
              <Pencil className="h-4 w-4" />
            </Button>
          </CanAccess>
          <CanAccess permission={PERMISSIONS.GEOFENCE_DELETE}>
            <Button
              size="icon"
              variant="ghost"
              aria-label={`Hapus ${row.nama}`}
              onClick={() => setPendingDelete(row)}
            >
              <Trash2 className="h-4 w-4" />
            </Button>
          </CanAccess>
        </div>
      ),
    },
  ];

  return (
    <div className="space-y-6">
      <PageHeader
        eyebrow="Data induk"
        title="Pagar Geografis"
        description="Batas yang diperiksa terhadap posisi armada. Pelanggaran muncul di papan monitoring."
        actions={
          <CanAccess permission={PERMISSIONS.GEOFENCE_CREATE}>
            <Button onClick={() => openEditor(EMPTY)}>
              <Plus className="mr-1.5 h-4 w-4" />
              Tambah pagar
            </Button>
          </CanAccess>
        }
      />

      <Panel>
        <PanelHeader title="Aturan aktif" hint={`${rows.length} aturan`} />
        <DataTable
          columns={columns}
          data={rows}
          isLoading={list.isLoading}
          rowKey={(row) => row.id}
          pageSize={12}
          defaultSortKey="nama"
          emptyIcon={MapPin}
          emptyMessage="Belum ada pagar geografis"
          emptyDescription="Tambahkan batas depot atau wilayah agar pelanggaran rute tercatat."
          dense
        />
      </Panel>

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="sm:max-w-2xl">
          {editing && (
            <form onSubmit={submit}>
              <DialogHeader>
                <DialogTitle>{editing.id ? "Ubah pagar" : "Tambah pagar"}</DialogTitle>
                <DialogDescription>
                  {editing.bentuk.jenis === "Lingkaran"
                    ? "Klik peta untuk menetapkan pusat, lalu isi radius."
                    : "Klik peta untuk menambah titik batas, minimal tiga."}
                </DialogDescription>
              </DialogHeader>

              <div className="grid grid-cols-1 gap-4 py-4 sm:grid-cols-2">
                <Field label="Kode" htmlFor="kode" error={errors.kode} required>
                  <TextInput
                    id="kode"
                    value={editing.kode}
                    // The service's business key, unique per tenant. Changing
                    // it on an existing fence would orphan the alerts filed
                    // against the old one in anybody's notes.
                    disabled={Boolean(editing.id)}
                    onChange={(e) => setEditing({ ...editing, kode: e.target.value })}
                  />
                </Field>
                <Field label="Nama" htmlFor="nama" error={errors.nama} required>
                  <TextInput
                    id="nama"
                    value={editing.nama}
                    onChange={(e) => setEditing({ ...editing, nama: e.target.value })}
                  />
                </Field>

                <Field
                  label="Jenis"
                  htmlFor="jenis"
                  hint={
                    editing.id
                      ? "Tidak bisa diubah. Buat aturan baru untuk bentuk lain."
                      : undefined
                  }
                >
                  <SelectInput
                    id="jenis"
                    value={editing.bentuk.jenis}
                    disabled={Boolean(editing.id)}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        bentuk:
                          e.target.value === "Poligon"
                            ? { jenis: "Poligon", batas: [] }
                            : {
                                jenis: "Lingkaran",
                                pusat: DEFAULT_CENTRE,
                                radiusMeter: 500,
                              },
                      })
                    }
                  >
                    <option value="Lingkaran">Lingkaran</option>
                    <option value="Poligon">Poligon</option>
                  </SelectInput>
                </Field>

                {editing.bentuk.jenis === "Lingkaran" ? (
                  <Field label="Radius (meter)" htmlFor="radius" error={errors.radius} required>
                    <TextInput
                      id="radius"
                      type="number"
                      value={editing.bentuk.radiusMeter}
                      onChange={(e) =>
                        setEditing({
                          ...editing,
                          bentuk: {
                            jenis: "Lingkaran",
                            pusat:
                              editing.bentuk.jenis === "Lingkaran"
                                ? editing.bentuk.pusat
                                : DEFAULT_CENTRE,
                            radiusMeter: Number(e.target.value),
                          },
                        })
                      }
                    />
                  </Field>
                ) : (
                  <Field label="Titik batas" hint="Klik peta untuk menambah" error={errors.bentuk}>
                    <p className="py-2 text-sm text-ink-muted">
                      {editing.bentuk.batas.length} titik
                    </p>
                  </Field>
                )}

                <Field label="Menjaga" htmlFor="subjek">
                  <SelectInput
                    id="subjek"
                    value={editing.subjek}
                    onChange={(e) =>
                      setEditing({ ...editing, subjek: e.target.value as FormState["subjek"] })
                    }
                  >
                    <option value="Depot">Depot</option>
                    <option value="Rute">Rute</option>
                    <option value="Area terlarang">Area terlarang</option>
                  </SelectInput>
                </Field>

                <Field label="Picu peringatan" htmlFor="mode">
                  <SelectInput
                    id="mode"
                    value={editing.mode}
                    onChange={(e) =>
                      setEditing({ ...editing, mode: e.target.value as FormState["mode"] })
                    }
                  >
                    <option value="Keluar">Saat meninggalkan area</option>
                    <option value="Masuk">Saat memasuki area</option>
                  </SelectInput>
                </Field>

                <Field label="Keparahan" htmlFor="keparahan">
                  <SelectInput
                    id="keparahan"
                    value={editing.keparahan}
                    onChange={(e) =>
                      setEditing({
                        ...editing,
                        keparahan: e.target.value as FormState["keparahan"],
                      })
                    }
                  >
                    <option value="Info">Info</option>
                    <option value="Peringatan">Peringatan</option>
                    <option value="Kritis">Kritis</option>
                  </SelectInput>
                </Field>

                <Field label="Keterangan" htmlFor="keterangan">
                  <TextInput
                    id="keterangan"
                    value={editing.keterangan}
                    onChange={(e) => setEditing({ ...editing, keterangan: e.target.value })}
                  />
                </Field>

                <div className="sm:col-span-2">
                  <FencePicker
                    shape={editing.bentuk}
                    centre={DEFAULT_CENTRE}
                    onChange={(bentuk) => setEditing({ ...editing, bentuk })}
                  />
                </div>
              </div>

              <DialogFooter>
                <Button type="button" variant="outline" onClick={() => setEditing(null)}>
                  Batal
                </Button>
                <Button type="submit" disabled={saveMutation.isPending}>
                  Simpan
                </Button>
              </DialogFooter>
            </form>
          )}
        </DialogContent>
      </Dialog>

      <ConfirmDialog
        isOpen={pendingDelete !== null}
        title="Hapus pagar ini?"
        message={
          pendingDelete
            ? `${pendingDelete.nama} tidak akan lagi memeriksa posisi armada. Pelanggaran yang sudah tercatat tetap tersimpan.`
            : ""
        }
        confirmLabel="Hapus"
        variant="destructive"
        isPending={deleteMutation.isPending}
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && deleteMutation.mutate(pendingDelete.id)}
      />
    </div>
  );
}
