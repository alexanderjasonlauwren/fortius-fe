import { scopeKey } from "@/lib/scope";
import { TransportTariffPanel } from "@/features/products/components/TransportTariffPanel";
import { CanAccess } from "@/features/rbac/components/CanAccess";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import {
  createOrUpdateProduct,
  getProductDetail,
  getUnits,
} from "@/features/products/api/productApi";
import { getChartOfAccounts } from "@/features/finance/api/financeApi";
import { leafAccounts } from "@/features/finance/lib/accounts";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import { Field, SegmentedControl, SelectInput, TextareaInput, TextInput, Toggle } from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import { formatPercentId, formatRupiah } from "@/lib/format";
import { useResettableState } from "@/hooks/useResettableState";

interface FormState {
  kode: string;
  nama: string;
  ukuran: string;
  hargaBeli: number;
  hargaJual: number;
  stok: number;
  stokMinimum: number;
  aktif: boolean;
  productKind: "commodity" | "accessory" | "container";
  inventoryAccountCode: string;
  revenueAccountCode: string;
  cogsAccountCode: string;
  unitId: string;
  deskripsi: string;
  merek: string;
  barcode: string;
}

const EMPTY: FormState = {
  kode: "",
  nama: "",
  ukuran: "",
  hargaBeli: 0,
  hargaJual: 0,
  stok: 0,
  stokMinimum: 0,
  aktif: true,
  productKind: "commodity",
  inventoryAccountCode: "",
  revenueAccountCode: "",
  cogsAccountCode: "",
  unitId: "",
  deskripsi: "",
  merek: "",
  barcode: "",
};

export function ProductFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});

  const detail = useQuery({
    queryKey: [...scopeKey(), "product-detail", id],
    queryFn: () => getProductDetail(id!),
    enabled: isEdit,
  });
  const accounts = useQuery({ queryKey: [...scopeKey(), "chart-of-accounts"], queryFn: getChartOfAccounts });
  // Units are global (a kilogram does not vary by agency): no scope key.
  const units = useQuery({ queryKey: ["product-units"], queryFn: getUnits, staleTime: Infinity });
  const postableAccounts = leafAccounts(accounts.data ?? []);

  // Seeded from the loaded product, or EMPTY while creating one. Computed
  // during render rather than pushed in by an effect, so the form never paints
  // a frame of the previous product's values while switching between two.
  const [form, setForm] = useResettableState<FormState>([detail.data], () => {
    const p = detail.data;
    if (!p) return EMPTY;
    return {
      kode: p.kode,
      nama: p.nama,
      ukuran: p.ukuran,
      hargaBeli: p.hargaBeli,
      hargaJual: p.hargaJual,
      stok: p.stok,
      stokMinimum: p.stokMinimum,
      aktif: p.aktif,
      productKind: p.productKind,
      inventoryAccountCode: p.inventoryAccountCode ?? "",
      revenueAccountCode: p.revenueAccountCode ?? "",
      cogsAccountCode: p.cogsAccountCode ?? "",
      unitId: p.unitId ?? "",
      deskripsi: p.deskripsi ?? "",
      merek: p.merek ?? "",
      barcode: p.barcode ?? "",
    };
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: FormState) =>
      createOrUpdateProduct(isEdit ? { ...values, id } : values),
    errorTitle: isEdit ? "Perubahan tidak tersimpan" : "Produk tidak ditambahkan",
    success: (p) => ({ title: `${p.nama} tersimpan` }),
    onDone: () => navigate("/products"),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  const margin = form.hargaJual - form.hargaBeli;
  const marginPct = form.hargaJual === 0 ? 0 : (margin / form.hargaJual) * 100;

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.nama.trim()) next.nama = "Nama produk wajib diisi.";
    if (form.hargaJual <= 0) next.hargaJual = "Harga jual harus lebih dari nol.";
    if (form.hargaBeli > form.hargaJual)
      next.hargaBeli = "Harga beli melebihi harga jual, jadi marginnya negatif.";
    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(form);
  };

  if (isEdit && detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-80 w-full" />
      </div>
    );
  }

  return (
    <div className="space-y-5">
      <Button variant="ghost" size="sm" onClick={() => navigate(-1)} className="-ml-2">
        <ArrowLeft className="h-3.5 w-3.5" />
        Kembali
      </Button>

      <PageHeader
        eyebrow="Data induk"
        title={isEdit ? `Ubah ${detail.data?.nama ?? "produk"}` : "Tambah produk"}
        description="Harga jual dipakai untuk menghitung nilai tagihan. Jumlah stok belum dicatat per produk; stok minimum tetap dapat diubah di sini."
      />

      <form onSubmit={submit}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Identitas produk" />
            <PanelBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label="Nama produk"
                htmlFor="nama"
                error={errors.nama}
                required
                className="sm:col-span-2"
              >
                <TextInput
                  id="nama"
                  value={form.nama}
                  invalid={!!errors.nama}
                  placeholder="LPG 3 Kg"
                  onChange={(e) => set("nama", e.target.value)}
                />
              </Field>

              <Field
                label="Kode SKU"
                htmlFor="kode"
                hint={isEdit ? undefined : "Dibuat otomatis jika dikosongkan."}
              >
                <TextInput
                  id="kode"
                  mono
                  value={form.kode}
                  placeholder="SKU-0007"
                  onChange={(e) => set("kode", e.target.value)}
                />
              </Field>

              <Field label="Ukuran" htmlFor="ukuran">
                <TextInput
                  id="ukuran"
                  value={form.ukuran}
                  placeholder="3 kg"
                  onChange={(e) => set("ukuran", e.target.value)}
                />
              </Field>

              <Field label="Satuan" htmlFor="satuan" hint="Satuan hitung: tabung, pcs, kg.">
                <SelectInput id="satuan" value={form.unitId} onChange={(e) => set("unitId", e.target.value)}>
                  <option value="">— Belum dipilih —</option>
                  {(units.data ?? []).map((u) => (
                    <option key={u.id} value={u.id}>{u.name} ({u.abbreviation})</option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="Merek" htmlFor="merek">
                <TextInput id="merek" maxLength={100} value={form.merek} placeholder="Pertamina" onChange={(e) => set("merek", e.target.value)} />
              </Field>

              <Field label="Barcode" htmlFor="barcode">
                <TextInput id="barcode" mono maxLength={100} value={form.barcode} onChange={(e) => set("barcode", e.target.value)} />
              </Field>

              <Field label="Deskripsi" htmlFor="deskripsi" className="sm:col-span-2">
                <TextareaInput id="deskripsi" rows={2} maxLength={2000} value={form.deskripsi} onChange={(e) => set("deskripsi", e.target.value)} />
              </Field>

              <Field label="Harga beli" htmlFor="beli" error={errors.hargaBeli}>
                <TextInput
                  id="beli"
                  type="number"
                  min={0}
                  step="any"
                  mono
                  value={form.hargaBeli}
                  invalid={!!errors.hargaBeli}
                  onChange={(e) => set("hargaBeli", Number(e.target.value))}
                />
              </Field>

              <Field label="Harga jual" htmlFor="jual" error={errors.hargaJual} required>
                <TextInput
                  id="jual"
                  type="number"
                  min={1}
                  step="any"
                  mono
                  value={form.hargaJual}
                  invalid={!!errors.hargaJual}
                  onChange={(e) => set("hargaJual", Number(e.target.value))}
                />
              </Field>
            </PanelBody>
          </Panel>

          <div className="space-y-4">
            <Panel>
              <PanelHeader title="Margin" />
              <PanelBody>
                <p className="data truncate text-figure font-semibold text-ink">
                  {formatRupiah(margin)}
                </p>
                <p className="mt-1 text-xs text-ink-muted">
                  {formatPercentId(marginPct, 1)} dari harga jual
                </p>
              </PanelBody>
            </Panel>

            <Panel>
              <PanelHeader title="Stok" />
              <PanelBody className="space-y-4">
                <Field
                  label="Stok minimum"
                  htmlFor="min"
                  hint="Peringatan muncul saat stok turun di bawah angka ini."
                >
                  <TextInput
                    id="min"
                    type="number"
                    min={0}
                    mono
                    value={form.stokMinimum}
                    onChange={(e) => set("stokMinimum", Number(e.target.value))}
                  />
                </Field>
                <div className="border-t border-line">
                  <Toggle
                    label="Aktif dijual"
                    description="Produk nonaktif tetap tersimpan tapi tidak muncul di katalog aktif."
                    checked={form.aktif}
                    onChange={(aktif) => set("aktif", aktif)}
                  />
                </div>
              </PanelBody>
            </Panel>
          </div>
        </div>

        <Panel className="mt-4">
          <PanelHeader
            title="Jenis & Akun"
            hint="Opsional. Kosongkan untuk memakai akun bawaan perusahaan."
          />
          <PanelBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <Field
              label="Jenis"
              htmlFor="product-kind"
              className="sm:col-span-2"
              hint={isEdit
                ? "Tidak dapat diubah setelah dibuat."
                : form.productKind === "container"
                  ? "Tabung kosong hanya dihitung jumlahnya di stok opname; tidak dibeli, dijual, atau dinilai."
                  : undefined}
            >
              {isEdit ? (
                <p className="py-1.5 text-sm text-ink">
                  {form.productKind === "accessory" ? "Perlengkapan" : form.productKind === "container" ? "Tabung kosong" : "Komoditas"}
                </p>
              ) : (
                <SegmentedControl
                  value={form.productKind}
                  onChange={(productKind) => set("productKind", productKind)}
                  options={[
                    { value: "commodity" as const, label: "Komoditas" },
                    { value: "accessory" as const, label: "Perlengkapan" },
                    { value: "container" as const, label: "Tabung kosong" },
                  ]}
                />
              )}
            </Field>
            <Field label="Akun persediaan" htmlFor="product-inv-account" hint="Menimpa akun 'persediaan' bawaan.">
              <SelectInput
                id="product-inv-account"
                value={form.inventoryAccountCode}
                onChange={(e) => set("inventoryAccountCode", e.target.value)}
              >
                <option value="">— Gunakan bawaan —</option>
                {postableAccounts.map((a) => (
                  <option key={a.akun.id} value={a.akun.kode}>{a.akun.kode} · {a.akun.nama}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Akun pendapatan" htmlFor="product-rev-account" hint="Menimpa akun 'pendapatan' bawaan.">
              <SelectInput
                id="product-rev-account"
                value={form.revenueAccountCode}
                onChange={(e) => set("revenueAccountCode", e.target.value)}
              >
                <option value="">— Gunakan bawaan —</option>
                {postableAccounts.map((a) => (
                  <option key={a.akun.id} value={a.akun.kode}>{a.akun.kode} · {a.akun.nama}</option>
                ))}
              </SelectInput>
            </Field>
            <Field label="Akun HPP" htmlFor="product-cogs-account" hint="Menimpa akun 'hpp' bawaan.">
              <SelectInput
                id="product-cogs-account"
                value={form.cogsAccountCode}
                onChange={(e) => set("cogsAccountCode", e.target.value)}
              >
                <option value="">— Gunakan bawaan —</option>
                {postableAccounts.map((a) => (
                  <option key={a.akun.id} value={a.akun.kode}>{a.akun.kode} · {a.akun.nama}</option>
                ))}
              </SelectInput>
            </Field>
          </PanelBody>
        </Panel>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button asChild variant="outline" type="button">
            <Link to="/products">Batal</Link>
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? "Simpan perubahan" : "Tambah produk"}
          </Button>
        </div>
      </form>
      {isEdit && id && (
        <CanAccess permission={PERMISSIONS.TRANSPORT_TARIFFS_VIEW}>
          <TransportTariffPanel productId={id} />
        </CanAccess>
      )}
    </div>
  );
}
