import { scopeKey } from "@/lib/scope";
import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { Moon, Sun, TriangleAlert } from "lucide-react";
import {
  getSettingsDetail,
  clearSettingOverride,
  updateSettings,
} from "@/features/settings/api/settingsApi";
import {
  INHERITABLE_FIELDS,
  type InheritableFieldKey,
} from "@/features/settings/api/fields";
import { useAuthStore } from "@/features/auth/store/authStore";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { useTheme } from "@/hooks/useTheme";
import { PageHeader } from "@/components/common/PageHeader";
import { InheritableField } from "@/features/settings/components/InheritableField";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { EmptyState } from "@/components/common/EmptyState";
import {
  Field,
  SegmentedControl,
  SelectInput,
  TextInput,
  TextareaInput,
  Toggle,
} from "@/components/common/Field";
import { RegistrationPackageSection } from "@/features/settings/components/RegistrationPackageSection";
import { NumberingSection } from "@/features/settings/components/NumberingSection";
import { SettlementSection } from "@/features/settings/components/SettlementSection";
import { OperationsSection } from "@/features/settings/components/OperationsSection";
import { TransportFeeRateSection } from "@/features/settings/components/TransportFeeRateSection";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { Button } from "@/components/ui/button";
import { cn, getInitials } from "@/lib/utils";
import type { SettingsEntity } from "@/types/domain";
import { describeAccess, describeRoles } from "@/features/rbac/access";

/**
 * Which group of settings is on screen.
 *
 * These were two pages — Pengaturan and Konfigurasi Sistem — and the split was
 * never defensible: both edited operations (one owned opening hours, the other
 * the geofence radius and lead time), and both now map to the single
 * iam.tenant_settings row the backend resolves with per-column inheritance.
 * "Which page do I change this on?" had no clean answer, and the old Pengaturan
 * page carried a "Konfigurasi lain" panel linking to the other one, which is
 * that awkwardness written down.
 */
type SettingsTab = "agen" | "operasi" | "istilah" | "master" | "sistem";

export function SettingsPage() {
  const [tab, setTab] = useState<SettingsTab>("agen");
  const { theme, setTheme } = useTheme();
  const user = useAuthStore((state) => state.user);

  const settings = useQuery({
    queryKey: [...scopeKey(), "settings", "detail"],
    queryFn: getSettingsDetail,
  });
  const [form, setForm] = useState<SettingsEntity | null>(null);

  /**
   * Fields this tenant has taken ownership of during THIS edit.
   *
   * Seeded from what it already owns, and added to when someone clicks "Ubah di
   * sini". It is what the save sends — and that is the whole point: sending the
   * full form would write an override for every inherited field the form merely
   * displayed, so changing a phone number would quietly pin the working day, the
   * timezone and the lexicon, and the parent could never change them for this
   * tenant again. The screen would look identical throughout.
   */
  const [owned, setOwned] = useState<Set<keyof SettingsEntity>>(new Set());

  useEffect(() => {
    if (!settings.data) return;
    setForm(structuredClone(settings.data.effective));
    setOwned(new Set(Object.keys(settings.data.own) as (keyof SettingsEntity)[]));
  }, [settings.data]);

  /**
   * Whether there is anything to save.
   *
   * Two ways there can be. The obvious one is an edited value. The other is a
   * field the tenant has just CLAIMED without changing — "Ubah di sini" on a
   * value it wants to keep at today's number but stop following the parent on.
   * Comparing forms alone missed that: the badge flipped, Save stayed disabled,
   * and the claim was lost on reload.
   */
  const claimed = settings.data
    ? [...owned].some((f) => !(f in settings.data!.own))
    : false;

  const dirty =
    !!form &&
    !!settings.data &&
    (claimed || JSON.stringify(form) !== JSON.stringify(settings.data.effective));

  /** The ancestor a field came from, when it is inherited. */
  const sourceOf = (field: InheritableFieldKey) =>
    owned.has(field) ? null : (settings.data?.inheritedFrom[field] ?? null);

  /** Take ownership of a field without changing its value yet. */
  const takeOver = (field: keyof SettingsEntity) =>
    setOwned((prev) => new Set(prev).add(field));

  const saveMutation = useDeskMutation({
    // Only what this tenant owns. Identity fields are never inheritable, so they
    // always travel; the rest travel only once someone has claimed them.
    mutationFn: (full: SettingsEntity) => {
      const patch: Partial<SettingsEntity> = {};
      for (const key of Object.keys(full) as (keyof SettingsEntity)[]) {
        const inheritable = (INHERITABLE_FIELDS as readonly string[]).includes(key);
        if (!inheritable || owned.has(key)) {
          (patch[key] as unknown) = full[key];
        }
      }
      return updateSettings(patch);
    },
    errorTitle: "Pengaturan tidak tersimpan",
    success: "Pengaturan disimpan",
  });

  const inheritMutation = useDeskMutation({
    mutationFn: (field: InheritableFieldKey) => clearSettingOverride(field),
    errorTitle: "Gagal mengembalikan ke warisan",
    success: "Kembali mengikuti pengaturan induk",
  });


  /**
   * Renders an inheritable field with its badge and both escape hatches.
   *
   * A closure rather than a component so the input inside keeps its identity
   * across renders — a component defined inline would remount on every keystroke
   * and the field would lose focus mid-word.
   */
  const inheritable = (
    field: InheritableFieldKey,
    label: string,
    htmlFor: string,
    input: ReactNode,
    className?: string,
  ) => (
    <InheritableField
      label={label}
      htmlFor={htmlFor}
      className={className}
      isOwn={owned.has(field)}
      inheritedFrom={sourceOf(field)}
      onOverride={() => takeOver(field)}
      onInherit={() => inheritMutation.mutate(field)}
    >
      {input}
    </InheritableField>
  );

  const set = <K extends keyof SettingsEntity>(key: K, value: SettingsEntity[K]) =>
    setForm((f) => (f ? { ...f, [key]: value } : f));

  /**
   * Belt-and-braces: `if (!form)` alone cannot tell "still loading" from
   * "failed" — both leave `form` null — so a genuine error read as an
   * eternal skeleton, with nothing on screen explaining why. Found live
   * against the API build; see lib/scope.ts's `setActiveScope` for the
   * root-cause fix this is deliberately kept alongside, not instead of.
   */
  if (settings.isError) {
    return (
      <Panel>
        <EmptyState
          icon={TriangleAlert}
          title="Pengaturan gagal dimuat"
          description={
            settings.error instanceof Error
              ? settings.error.message
              : "Terjadi kesalahan yang tidak diketahui."
          }
          action={
            <Button size="sm" onClick={() => settings.refetch()}>
              Coba lagi
            </Button>
          }
        />
      </Panel>
    );
  }

  if (!form) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <PageHeader
        title="Pengaturan"
        description="Identitas agen, cara kerja harian, istilah yang dipakai, dan data acuan konsol."
        meta={
          <SegmentedControl
            value={tab}
            onChange={setTab}
            options={[
              { value: "agen" as const, label: "Profil agen" },
              { value: "operasi" as const, label: "Operasional" },
              { value: "istilah" as const, label: "Istilah" },
              { value: "master" as const, label: "Data acuan" },
              { value: "sistem" as const, label: "Sistem" },
            ]}
          />
        }
        actions={
          dirty && (
            <>
              <Button
                variant="outline"
                onClick={() => settings.data && setForm(structuredClone(settings.data.effective))}
              >
                Urungkan
              </Button>
              <Button
                onClick={() => saveMutation.mutate(form)}
                disabled={saveMutation.isPending}
              >
                Simpan perubahan
              </Button>
            </>
          )
        }
      />

      {/* The account menu links here for "Profil saya", so it leads the page. */}
      <Panel>
        <PanelHeader title="Akun saya" hint="Identitas Anda di konsol ini" />
        <PanelBody className="flex flex-wrap items-start gap-5">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-md bg-ink text-sm font-bold text-ink-on">
            {getInitials(user?.name ?? "SD")}
          </span>
          <div className="min-w-0 flex-1">
            <p className="text-lg font-semibold tracking-[-0.01em] text-ink">
              {user?.name ?? "—"}
            </p>
            <p className="data text-xs text-ink-muted">{user?.email ?? "—"}</p>
            <dl className="mt-3 grid grid-cols-2 gap-x-6 gap-y-2 text-xs sm:grid-cols-3">
              <div>
                <dt className="text-ink-muted">Peran</dt>
                <dd className="font-medium text-ink">
                  {user ? describeRoles(user.roles) : "—"}
                </dd>
              </div>
              <div>
                <dt className="text-ink-muted">Cabang</dt>
                <dd className="font-medium text-ink">{user?.branch ?? "—"}</dd>
              </div>
              <div>
                <dt className="text-ink-muted">Telepon</dt>
                <dd className="data text-ink">{user?.phone ?? "—"}</dd>
              </div>
            </dl>
            <p className="mt-3 max-w-xl text-xs leading-relaxed text-ink-muted">
              {user ? describeAccess(user.permissions) : ""}
            </p>
            <p className="mt-3 text-xs text-ink-muted">
              Peran dan cabang diatur oleh admin di{" "}
              <Link
                to="/users"
                className="font-semibold text-ink underline decoration-signal decoration-2 underline-offset-4"
              >
                Pengguna &amp; Akses
              </Link>
              .
            </p>
          </div>
        </PanelBody>
      </Panel>

      <div className="grid grid-cols-1 gap-4 xl:grid-cols-2">
        {tab === "agen" && (
        <Panel>
          <PanelHeader title="Profil agen" hint="Muncul pada surat jalan dan laporan cetak" />
          <PanelBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field label="Nama perusahaan" htmlFor="nama" className="sm:col-span-2">
              <TextInput
                id="nama"
                value={form.namaPerusahaan}
                onChange={(e) => set("namaPerusahaan", e.target.value)}
              />
            </Field>
            <Field label="Nomor agen" htmlFor="agen">
              <TextInput
                id="agen"
                mono
                value={form.nomorAgen}
                onChange={(e) => set("nomorAgen", e.target.value)}
              />
            </Field>
            <Field label="Telepon" htmlFor="telp">
              <TextInput
                id="telp"
                mono
                value={form.telepon}
                onChange={(e) => set("telepon", e.target.value)}
              />
            </Field>
            <Field label="Email" htmlFor="email" className="sm:col-span-2">
              <TextInput
                id="email"
                type="email"
                mono
                value={form.email}
                onChange={(e) => set("email", e.target.value)}
              />
            </Field>
            <Field label="Alamat" htmlFor="alamat" className="sm:col-span-2">
              <TextareaInput
                id="alamat"
                rows={2}
                value={form.alamat}
                onChange={(e) => set("alamat", e.target.value)}
              />
            </Field>
          </PanelBody>
        </Panel>
        )}

        {tab === "agen" && (
        <Panel>
          <PanelHeader
            title="Identitas hukum"
            hint="Tidak diwarisi. Setiap badan hukum punya datanya sendiri"
          />
          <PanelBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Nama legal"
              htmlFor="legal"
              hint="Sesuai akta. Berbeda dari nama dagang di atas."
              className="sm:col-span-2"
            >
              <TextInput
                id="legal"
                value={form.namaLegal}
                onChange={(e) => set("namaLegal", e.target.value)}
              />
            </Field>
            <Field label="Nomor registrasi" htmlFor="nib" hint="NIB / SIUP">
              <TextInput
                id="nib"
                mono
                value={form.nomorRegistrasi}
                onChange={(e) => set("nomorRegistrasi", e.target.value)}
              />
            </Field>
            <Field label="NPWP" htmlFor="npwp" hint="Muncul pada faktur pajak">
              <TextInput
                id="npwp"
                mono
                value={form.npwp}
                onChange={(e) => set("npwp", e.target.value)}
              />
            </Field>
            {/* Timezone sits with the legal identity, not with operations: it is
                iam.tenant_profiles.timezone, and profiles never inherit. A legal
                entity's timezone belongs with its registered address. */}
            <Field label="Zona waktu" htmlFor="tz">
              <SelectInput
                id="tz"
                value={form.zonaWaktu}
                onChange={(e) => set("zonaWaktu", e.target.value)}
              >
                {/* Asia/Jakarta is the IANA identifier for WIB, which covers
                    Central Java. It names a timezone, not a city. */}
                <option value="Asia/Jakarta">WIB (Asia/Jakarta)</option>
                <option value="Asia/Makassar">WITA (Asia/Makassar)</option>
                <option value="Asia/Jayapura">WIT (Asia/Jayapura)</option>
              </SelectInput>
            </Field>
            <div className="sm:col-span-2">
              <Toggle
                checked={form.pkp}
                onChange={(next) => {
                  set("pkp", next);
                  // Mirrors ck_tenant_profiles_pkp_tax. A non-PKP entity must
                  // not carry a rate at all, so clearing it here means the form
                  // cannot submit a combination the database already refuses.
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
          </PanelBody>
        </Panel>
        )}

        {tab === "agen" && (
        <Panel className="xl:col-span-2">
          <PanelHeader
            title="Kantor terdaftar"
            hint="Alamat resmi badan hukum, bukan titik awal distribusi"
          />
          <PanelBody className="space-y-3">
            <p className="text-xs leading-relaxed text-ink-muted">
              Armada memuat dari <span className="font-medium text-ink">cabang</span>,
              dan satu PT bisa punya beberapa. Koordinat di sini dipakai untuk menampilkan perusahaan di peta dan sebagai titik awal cabang pertama
              yang dibuat tanpa koordinat sendiri.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Lintang (latitude)" htmlFor="lat">
                <TextInput
                  id="lat"
                  type="number"
                  mono
                  step="0.0001"
                  value={form.kantorLat ?? ""}
                  onChange={(e) =>
                    set("kantorLat", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
              </Field>
              <Field label="Bujur (longitude)" htmlFor="lng">
                <TextInput
                  id="lng"
                  type="number"
                  mono
                  step="0.0001"
                  value={form.kantorLng ?? ""}
                  onChange={(e) =>
                    set("kantorLng", e.target.value === "" ? undefined : Number(e.target.value))
                  }
                />
              </Field>
            </div>
          </PanelBody>
        </Panel>
        )}

        {tab === "operasi" && (
        <Panel>
          <PanelHeader
            title="Operasional"
            hint="Menentukan rentang papan berangkat dan nilai tagihan"
          />
          <PanelBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            {inheritable(
              "jamOperasionalMulai",
              "Jam buka",
              "buka",
              <TextInput
                id="buka"
                type="time"
                mono
                value={form.jamOperasionalMulai}
                onChange={(e) => {
                  takeOver("jamOperasionalMulai");
                  set("jamOperasionalMulai", e.target.value);
                }}
              />,
            )}
            {inheritable(
              "jamOperasionalSelesai",
              "Jam tutup",
              "tutup",
              <TextInput
                id="tutup"
                type="time"
                mono
                value={form.jamOperasionalSelesai}
                onChange={(e) => {
                  takeOver("jamOperasionalSelesai");
                  set("jamOperasionalSelesai", e.target.value);
                }}
              />,
            )}
            {/* No badge: a daily commercial target is the console's own, with
                no column behind it in iam.tenant_settings, so it cannot inherit
                against the API. */}
            <Field
              label="Target harian"
              htmlFor="target"
              hint="Dipakai bila belum ada rencana untuk hari itu."
            >
              <TextInput
                id="target"
                type="number"
                min={1}
                step="any"
                mono
                value={form.targetHarian}
                onChange={(e) => set("targetHarian", Number(e.target.value))}
              />
            </Field>

          </PanelBody>
        </Panel>
        )}

        {/* The other half of "operational", which used to live on a separate
            page: geofence radius, stop duration, planning lead time and whether
            driver location is recorded. Same iam.tenant_settings row. */}
        {tab === "operasi" && <OperationsSection />}
        {tab === "operasi" && (
          <CanAccess permission={PERMISSIONS.SETTINGS_EDIT}>
            <SettlementSection />
          </CanAccess>
        )}
        {tab === "operasi" && (
          <CanAccess permission={PERMISSIONS.TRANSPORT_TARIFFS_VIEW}>
            <TransportFeeRateSection />
          </CanAccess>
        )}

        {tab === "istilah" && (
        <Panel className="lg:col-span-2">
          <PanelHeader
            title="Istilah"
            hint="Sebutan yang dipakai di seluruh konsol. Ubah bila bidang usahanya lain"
          />
          <PanelBody className="space-y-4">
            <p className="text-xs leading-relaxed text-ink-muted">
              Tiga sebutan ini dipakai di seluruh konsol: halaman, kolom tabel, surat jalan, dan berkas ekspor. Mengubahnya hanya mengganti label; angka dan riwayat tidak berubah.
            </p>
            <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
              <Field
                label="Satuan"
                htmlFor="istilah-satuan"
                hint="Satu unit yang Anda antar, misalnya tabung, galon, dus, sak. Dipakai pada angka gabungan lintas produk."
              >
                <TextInput
                  id="istilah-satuan"
                  value={form.istilah.satuan}
                  placeholder="tabung"
                  onChange={(e) =>
                    set("istilah", { ...form.istilah, satuan: e.target.value })
                  }
                />
              </Field>
              <Field
                label="Titik antar"
                htmlFor="istilah-outlet"
                hint="Tempat tujuan pengiriman, misalnya pangkalan, depot, toko, gerai."
              >
                <TextInput
                  id="istilah-outlet"
                  value={form.istilah.outlet}
                  placeholder="outlet"
                  onChange={(e) =>
                    set("istilah", { ...form.istilah, outlet: e.target.value })
                  }
                />
              </Field>
              <Field
                label="Pemasok"
                htmlFor="istilah-pemasok"
                hint="Sumber pasokan yang kuotanya Anda tarik, misalnya SPBE, pabrik, distributor pusat."
              >
                <TextInput
                  id="istilah-pemasok"
                  value={form.istilah.pemasok}
                  placeholder="SPBE"
                  onChange={(e) =>
                    set("istilah", { ...form.istilah, pemasok: e.target.value })
                  }
                />
              </Field>
            </div>
          </PanelBody>
        </Panel>
        )}

        {tab === "master" && (
          <div className="space-y-4 lg:col-span-2">
            {/* Accounting parity P6 moved the finance master data next to the
                work that uses it, as Jurnal keeps it. */}
            <p className="text-xs text-ink-muted">
              Vendor ada di{" "}
              <Link to="/purchases?tab=vendor" className="font-semibold text-ink underline underline-offset-4">Pembelian</Link>,
              kategori biaya di{" "}
              <Link to="/expenses?tab=kategori" className="font-semibold text-ink underline underline-offset-4">Pengeluaran</Link>,
              rekening kas &amp; bank di{" "}
              <Link to="/cash-bank?tab=rekening" className="font-semibold text-ink underline underline-offset-4">Kas &amp; Bank</Link>,
              dan penerbit SA di{" "}
              <Link to="/sa" className="font-semibold text-ink underline underline-offset-4">Schedule Agreement</Link>.
            </p>
            <RegistrationPackageSection />
            <NumberingSection />
          </div>
        )}

        {tab === "sistem" && (
        <Panel>
          <PanelHeader title="Tampilan" />
          <PanelBody>
            <p className="label mb-2 text-2xs text-ink-muted">Tema</p>
            <div className="flex gap-2">
              {(
                [
                  { value: "light", label: "Terang", icon: Sun },
                  { value: "dark", label: "Gelap", icon: Moon },
                ] as const
              ).map((option) => {
                const Icon = option.icon;
                const active = theme === option.value;
                return (
                  <button
                    key={option.value}
                    type="button"
                    onClick={() => setTheme(option.value)}
                    aria-pressed={active}
                    className={cn(
                      "flex flex-1 items-center justify-center gap-2 rounded-md border px-4 py-3 text-sm font-semibold transition-colors",
                      active
                        ? "border-ink bg-ink text-ink-on"
                        : "border-line bg-panel text-ink-muted hover:border-line-strong hover:text-ink",
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {option.label}
                  </button>
                );
              })}
            </div>
            <p className="mt-3 text-xs leading-relaxed text-ink-muted">
              Pilihan tersimpan di peramban ini dan berlaku untuk seluruh konsol,
              termasuk grafik dan peta.
            </p>
          </PanelBody>
        </Panel>
        )}

      </div>
    </div>
  );
}
