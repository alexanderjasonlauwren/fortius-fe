import { useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { createTenant } from "@/features/tenancy/api/tenancyApi";
import { useScope } from "@/features/tenancy/useScope";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { Field, SelectInput, TextInput, Toggle } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import type { CreateTenantInput } from "@/features/tenancy/api/contract";

const EMPTY: CreateTenantInput = {
  kode: "",
  nama: "",
  jenisUsaha: "lpg_distribution",
  namaLegal: "",
  pkp: false,
  tarifPajakDefault: 0,
  provinsi: "Jawa Tengah",
  cabangKode: "",
  cabangNama: "",
};

/**
 * Creates a sub-tenant beneath the tenant currently being acted as.
 *
 * # Why the parent is not a field
 *
 * It is the acting tenant. Offering a picker would suggest the choice is the
 * form's to make, when the backend decides it from the session — its row-level
 * security admits a tenant only beneath one the caller can already see. A field
 * that cannot influence the outcome is worse than no field.
 *
 * # Why the first branch is
 *
 * `branch_id` is NOT NULL on nine operational tables and document number series
 * are issued per branch, so a tenant created without one exists and can record
 * nothing — no delivery, no invoice, no payment — with nothing on screen saying
 * why. Asking for it here is the difference between a tenant and a usable one.
 */
export function TenantFormDialog({
  isOpen,
  onClose,
}: {
  isOpen: boolean;
  onClose: () => void;
}) {
  const { tenant: acting } = useScope();
  const queryClient = useQueryClient();
  const [form, setForm] = useState<CreateTenantInput>(EMPTY);

  const set = <K extends keyof CreateTenantInput>(key: K, value: CreateTenantInput[K]) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const create = useDeskMutation({
    mutationFn: () => createTenant(form),
    errorTitle: "Tenant tidak dibuat",
    // Says what provisioning actually built. A bare "saved" would hide that the
    // tenant arrived with a chart of accounts and a usable branch, which is the
    // part that makes it work at all.
    success: (result) => ({
      title: `${result.tenant.nama} dibuat`,
      description:
        `${result.jumlahAkun} akun, ${result.jumlahPenomoran} seri dokumen, ` +
        `istilah "${result.istilah.satuan}". ` +
        (result.pendiriDitunjuk ? "Anda menjadi admin pertamanya." : ""),
    }),
    onDone: () => {
      queryClient.clear();
      setForm(EMPTY);
      onClose();
    },
  });

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/50 p-4 sm:p-8">
      <div className="animate-in-up w-full max-w-2xl rounded-md border border-line bg-panel shadow-pop">
        <div className="border-b border-line px-5 py-4">
          <h2 className="text-sm font-semibold text-ink">Tambah sub-tenant</h2>
          <p className="mt-1 text-xs text-ink-muted">
            Dibuat di bawah <span className="font-medium text-ink">{acting?.nama}</span>.
            Induk mengikuti tenant yang sedang aktif.
          </p>
        </div>

        <div className="grid grid-cols-1 gap-4 px-5 py-4 sm:grid-cols-2">
          <Field label="Kode" htmlFor="kode" required>
            <TextInput
              id="kode"
              mono
              value={form.kode}
              onChange={(e) => set("kode", e.target.value)}
            />
          </Field>
          <Field label="Nama" htmlFor="nama" required>
            <TextInput id="nama" value={form.nama} onChange={(e) => set("nama", e.target.value)} />
          </Field>

          <Field
            label="Jenis usaha"
            htmlFor="usaha"
            hint="Menentukan istilah awal dan kategori produk. Tidak diwarisi dari induk."
            className="sm:col-span-2"
          >
            <SelectInput
              id="usaha"
              value={form.jenisUsaha}
              onChange={(e) => set("jenisUsaha", e.target.value)}
            >
              <option value="lpg_distribution">Distribusi LPG (tabung, pangkalan, SPBE)</option>
              <option value="water_depot">Depot Air Minum (galon, depot, pabrik)</option>
            </SelectInput>
          </Field>

          <Field label="Nama legal" htmlFor="legal" required className="sm:col-span-2">
            <TextInput
              id="legal"
              value={form.namaLegal}
              onChange={(e) => set("namaLegal", e.target.value)}
            />
          </Field>

          <Field label="Nomor registrasi" htmlFor="reg">
            <TextInput
              id="reg"
              mono
              value={form.nomorRegistrasi ?? ""}
              onChange={(e) => set("nomorRegistrasi", e.target.value)}
            />
          </Field>
          <Field label="Kota" htmlFor="kota">
            <TextInput id="kota" value={form.kota ?? ""} onChange={(e) => set("kota", e.target.value)} />
          </Field>

          <div className="sm:col-span-2">
            <Toggle
              checked={form.pkp}
              onChange={(next) => {
                set("pkp", next);
                // A non-PKP entity must not carry a rate at all — the database
                // refuses it, and clearing here means the form cannot submit a
                // combination it already knows is invalid.
                if (!next) set("tarifPajakDefault", 0);
              }}
              label="Terdaftar sebagai PKP"
              description="Hanya PKP yang boleh memungut PPN pada faktur."
            />
          </div>

          {form.pkp && (
            <Field label="Tarif PPN default (%)" htmlFor="ppn">
              <TextInput
                id="ppn"
                type="number"
                mono
                min={0}
                max={100}
                value={form.tarifPajakDefault}
                onChange={(e) => set("tarifPajakDefault", Number(e.target.value))}
              />
            </Field>
          )}

          <div className="sm:col-span-2 border-t border-line pt-4">
            <p className="label text-2xs text-ink-muted">Cabang pertama</p>
            <p className="mt-1 text-xs leading-relaxed text-ink-muted">
              Tempat armada memuat. Wajib: setiap pengiriman, faktur dan pembayaran
              tercatat pada sebuah cabang, dan penomoran dokumen terbit per cabang.
              Cabang lain bisa ditambahkan kapan saja.
            </p>
          </div>

          <Field label="Kode cabang" htmlFor="cabkode" required>
            <TextInput
              id="cabkode"
              mono
              value={form.cabangKode}
              onChange={(e) => set("cabangKode", e.target.value)}
            />
          </Field>
          <Field label="Nama cabang" htmlFor="cabnama" required>
            <TextInput
              id="cabnama"
              value={form.cabangNama}
              onChange={(e) => set("cabangNama", e.target.value)}
            />
          </Field>
        </div>

        <div className="flex justify-end gap-2 border-t border-line px-5 py-3">
          <Button variant="outline" onClick={onClose}>
            Batal
          </Button>
          <Button
            onClick={() => create.mutate(undefined as never)}
            disabled={
              create.isPending ||
              !form.kode ||
              !form.nama ||
              !form.namaLegal ||
              !form.cabangKode ||
              !form.cabangNama
            }
          >
            Buat tenant
          </Button>
        </div>
      </div>
    </div>
  );
}
