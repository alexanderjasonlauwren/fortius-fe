import { scopeKey } from "@/lib/scope";
import { useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { useQuery } from "@tanstack/react-query";
import { ArrowLeft, Loader2, Save } from "lucide-react";
import {
  createOrUpdateOutlet,
  getKecamatanOptions,
  getOutletDetail,
} from "@/features/outlet/api/outletApi";
import { useDeskMutation } from "@/hooks/useDeskMutation";
import { PageHeader } from "@/components/common/PageHeader";
import { Panel, PanelBody, PanelHeader, Skeleton } from "@/components/common/Panel";
import {
  Field,
  SelectInput,
  TextInput,
  TextareaInput,
  Toggle,
} from "@/components/common/Field";
import { Button } from "@/components/ui/button";
import type { BankNameEntity, OutletStatus } from "@/types/domain";
import { outletLabel, outletLabelTitle, unitLabel } from "@/lib/lexicon";
import { useScope } from "@/features/tenancy/useScope";
import { useResettableState } from "@/hooks/useResettableState";
import { LocationPicker } from "@/features/outlet/components/LocationPicker";
import { isWithinIndonesia, parseCoordinatePaste } from "@/features/outlet/lib/parseCoordinates";

const BANKS: BankNameEntity[] = ["BCA", "BNI", "Mandiri", "BRI", "BSI"];

interface FormState {
  kode: string;
  nama: string;
  penanggungJawab: string;
  telepon: string;
  bank: BankNameEntity | "";
  noRekening: string;
  alamat: string;
  kecamatan: string;
  kota: string;
  provinsi: string;
  kodePos: string;
  npwp: string;
  email: string;
  status: OutletStatus;
  kuotaBulanan: number;
  termin: number;
  batasKredit: number;
  blokirOtomatis: boolean;
  lat: number;
  lng: number;
}

const EMPTY: FormState = {
  kode: "",
  nama: "",
  penanggungJawab: "",
  telepon: "",
  bank: "",
  noRekening: "",
  alamat: "",
  kecamatan: "",
  kota: "Kota Salatiga",
  provinsi: "Jawa Tengah",
  kodePos: "",
  npwp: "",
  email: "",
  status: "Aktif",
  kuotaBulanan: 600,
  termin: 7,
  batasKredit: 0,
  blokirOtomatis: true,
  // 0, 0 is not a real point anyone delivers to -- it is this form's sentinel
  // for "no pin yet" (see LocationPicker and outletApi.http.ts's write path).
  // A brand-new outlet starts unplaced rather than defaulting to the pool's
  // own city centre, which used to let an outlet nobody had actually pinned
  // sit on the route optimizer's map as if it had been.
  lat: 0,
  lng: 0,
};

export function OutletFormPage() {
  const { id } = useParams();
  const navigate = useNavigate();
  const isEdit = !!id;

  const [errors, setErrors] = useState<Partial<Record<keyof FormState, string>>>({});
  const { branchId } = useScope();
  const [coordPaste, setCoordPaste] = useState("");
  const [coordPasteError, setCoordPasteError] = useState<string | undefined>();

  const detail = useQuery({
    queryKey: [...scopeKey(), "outlet-detail", id],
    queryFn: () => getOutletDetail(id!),
    enabled: isEdit,
  });

  const kecamatanOptions = useQuery({
    queryKey: [...scopeKey(), "kecamatan-options"],
    queryFn: getKecamatanOptions,
  });

  // Seeded from the loaded outlet, or EMPTY while creating one. Computed during
  // render rather than pushed in by an effect, so the form never paints a frame
  // of the previous outlet's values while switching between two.
  const [form, setForm] = useResettableState<FormState>([detail.data], () => {
    const p = detail.data;
    if (!p) return EMPTY;
    return {
      kode: p.kode,
      nama: p.nama,
      penanggungJawab: p.penanggungJawab,
      telepon: p.telepon,
      bank: p.bank ?? "",
      noRekening: p.noRekening ?? "",
      alamat: p.alamat,
      kecamatan: p.kecamatan,
      kota: p.kota,
      provinsi: p.provinsi ?? "",
      kodePos: p.kodePos ?? "",
      npwp: p.npwp ?? "",
      email: p.email ?? "",
      status: p.status,
      kuotaBulanan: p.kuotaBulanan,
      termin: p.termin ?? 7,
      batasKredit: p.batasKredit ?? 0,
      blokirOtomatis: p.blokirOtomatis ?? true,
      lat: p.lat,
      lng: p.lng,
    };
  });

  const saveMutation = useDeskMutation({
    mutationFn: (values: FormState) => {
      // "" means "no bank on file" in the form's own select, which is a
      // legitimate state for an outlet whose account isn't known yet -- but
      // OutletEntity.bank is BankNameEntity | undefined, so the empty option
      // is normalised to absent here rather than sent as a literal string.
      const payload = { ...values, bank: values.bank || undefined };
      // A new outlet is filed under the branch the console is scoped to.
      return createOrUpdateOutlet(isEdit ? { ...payload, id } : { ...payload, branchId: branchId ?? undefined });
    },
    errorTitle: isEdit ? "Perubahan tidak tersimpan" : `${outletLabelTitle()} tidak terdaftar`,
    success: (p) => ({
      title: isEdit ? `${p.nama} diperbarui` : `${p.nama} terdaftar`,
      description: isEdit
        ? undefined
        : `${outletLabelTitle()} siap dipilih pada rencana distribusi berikutnya.`,
    }),
    onDone: (p) => navigate(`/outlet/${p.id}`),
  });

  const set = <K extends keyof FormState>(key: K, value: FormState[K]) => {
    setForm((f) => ({ ...f, [key]: value }));
    setErrors((e) => ({ ...e, [key]: undefined }));
  };

  /**
   * Reads "Tempel koordinat" -- the shape Google Maps' own "Copy
   * coordinates" puts on the clipboard -- rather than asking someone to
   * split it across two number fields by hand.
   */
  const applyCoordPaste = () => {
    if (!coordPaste.trim()) return;
    const parsed = parseCoordinatePaste(coordPaste);
    if (!parsed) {
      setCoordPasteError("Format harus “lintang, bujur”, mis. -7.3305, 110.5084.");
      return;
    }
    if (!isWithinIndonesia(parsed.lat, parsed.lng)) {
      setCoordPasteError("Koordinat ini berada di luar Indonesia. Periksa urutan lintang dan bujur.");
      return;
    }
    set("lat", parsed.lat);
    set("lng", parsed.lng);
    setCoordPaste("");
    setCoordPasteError(undefined);
  };

  const submit = (e: React.FormEvent) => {
    e.preventDefault();
    const next: typeof errors = {};
    if (!form.nama.trim()) next.nama = `Nama ${outletLabel()} wajib diisi.`;
    // Required by the service, which makes it unique per tenant. The mock used
    // to invent one and the hint said so -- against the API that produced a 422
    // naming a field the form had told the operator to leave blank.
    if (!form.kode.trim()) next.kode = "Kode wajib diisi.";
    if (!form.kecamatan.trim()) next.kecamatan = "Kecamatan wajib dipilih.";
    if (!form.telepon.trim()) next.telepon = "Nomor telepon wajib diisi agar dapat dihubungi kurir.";
    if (form.email.trim() && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email.trim())) next.email = "Format email tidak valid.";
    if (form.kuotaBulanan <= 0) next.kuotaBulanan = "Kuota bulanan harus lebih dari nol.";

    setErrors(next);
    if (Object.keys(next).length > 0) return;
    saveMutation.mutate(form);
  };

  if (isEdit && detail.isLoading) {
    return (
      <div className="space-y-4">
        <Skeleton className="h-8 w-64" />
        <Skeleton className="h-96 w-full" />
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
        title={isEdit ? `Ubah ${detail.data?.nama ?? "${outletLabel()}"}` : `Daftarkan ${outletLabel()}`}
        description={
          isEdit
            ? "Perubahan berlaku untuk rencana distribusi berikutnya. Surat jalan yang sudah terbit tidak ikut berubah."
            : `${outletLabelTitle()} baru langsung dapat dipilih saat menyusun rencana distribusi.`
        }
      />

      <form onSubmit={submit}>
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
          <Panel className="lg:col-span-2">
            <PanelHeader title="Identitas" />
            <PanelBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field
                label={`Nama ${outletLabel()}`}
                htmlFor="nama"
                error={errors.nama}
                required
                className="sm:col-span-2"
              >
                <TextInput
                  id="nama"
                  value={form.nama}
                  invalid={!!errors.nama}
                  placeholder={`${outletLabelTitle()} Jaya Abadi`}
                  onChange={(e) => set("nama", e.target.value)}
                />
              </Field>

              {/*
                The hint used to promise "dibuat otomatis jika dikosongkan".
                The mock did invent one; the service does not, and refuses a
                create without it — so the form was telling the operator to
                leave blank the one field that would fail the save.
              */}
              <Field
                label="Kode"
                htmlFor="kode"
                error={errors.kode}
                required
                hint="Referensi milik agen, mis. PKL-0025."
              >
                <TextInput
                  id="kode"
                  mono
                  value={form.kode}
                  invalid={!!errors.kode}
                  placeholder="PKL-0025"
                  onChange={(e) => set("kode", e.target.value)}
                />
              </Field>

              <Field label="Status" htmlFor="status">
                <SelectInput
                  id="status"
                  value={form.status}
                  onChange={(e) => set("status", e.target.value as OutletStatus)}
                >
                  <option value="Aktif">Aktif (dapat menerima pengiriman)</option>
                  <option value="Nonaktif">Nonaktif (tidak dilayani sementara)</option>
                  <option value="Ditangguhkan">Ditangguhkan (bermasalah)</option>
                </SelectInput>
              </Field>

              <Field
                label="Penanggung jawab"
                htmlFor="pj"
                hint="Orang yang menerima dan menandatangani surat jalan."
              >
                <TextInput
                  id="pj"
                  value={form.penanggungJawab}
                  onChange={(e) => set("penanggungJawab", e.target.value)}
                />
              </Field>

              <Field label="Telepon" htmlFor="telepon" error={errors.telepon} required>
                <TextInput
                  id="telepon"
                  mono
                  inputMode="tel"
                  placeholder="0812xxxxxxx"
                  value={form.telepon}
                  invalid={!!errors.telepon}
                  onChange={(e) => set("telepon", e.target.value)}
                />
              </Field>
            </PanelBody>
          </Panel>

          <Panel>
            <PanelHeader title="Kuota & kredit" />
            <PanelBody className="space-y-4">
              <Field
                label="Kuota bulanan"
                htmlFor="kuota"
                error={errors.kuotaBulanan}
                hint={`Batas ${unitLabel()} yang boleh diterima ${outletLabel()} ini setiap bulan.`}
                required
              >
                {/*
                  step="any", not a spinner increment.

                  `step` is a VALIDITY constraint, not a nudge: with min={1} and
                  step={50} the only legal values were 1, 51, 101 … so a monthly
                  quota of 600 was refused by the browser. And refused silently
                  — the form's own validation passed, so nothing rendered, the
                  submit handler never ran, and pressing "Daftarkan pangkalan"
                  did nothing at all. Six inputs across the console had the same
                  trap, each with a `min` one off its `step`.
                */}
                <TextInput
                  id="kuota"
                  type="number"
                  min={1}
                  step="any"
                  mono
                  value={form.kuotaBulanan}
                  invalid={!!errors.kuotaBulanan}
                  onChange={(e) => set("kuotaBulanan", Number(e.target.value))}
                />
              </Field>

              <Field
                label="Termin pembayaran"
                htmlFor="termin"
                hint="Hari sampai tagihan jatuh tempo. Nol berarti bayar di tempat."
              >
                <TextInput
                  id="termin"
                  type="number"
                  min={0}
                  max={90}
                  mono
                  value={form.termin}
                  onChange={(e) => set("termin", Number(e.target.value))}
                />
              </Field>

              <Field
                label="Plafon kredit"
                htmlFor="plafon"
                hint="Batas piutang berjalan dalam rupiah. Nol berarti tanpa batas."
              >
                <TextInput
                  id="plafon"
                  type="number"
                  min={0}
                  step="any"
                  mono
                  value={form.batasKredit}
                  onChange={(e) => set("batasKredit", Number(e.target.value))}
                />
              </Field>

              <Field
                label="Bank"
                htmlFor="bank"
                hint="Rekening asal yang diharapkan. Otomatis mengisi form penerimaan kas."
              >
                <SelectInput
                  id="bank"
                  value={form.bank}
                  onChange={(e) => set("bank", e.target.value as BankNameEntity | "")}
                >
                  <option value="">Belum diketahui</option>
                  {BANKS.map((b) => (
                    <option key={b} value={b}>
                      {b}
                    </option>
                  ))}
                </SelectInput>
              </Field>

              <Field label="No. rekening" htmlFor="rekening">
                <TextInput
                  id="rekening"
                  mono
                  value={form.noRekening}
                  onChange={(e) => set("noRekening", e.target.value)}
                />
              </Field>

              <div className="border-t border-line">
                <Toggle
                  label="Blokir otomatis"
                  description={`Tolak konfirmasi rencana bila ${outletLabel()} menunggak atau melewati plafon.`}
                  checked={form.blokirOtomatis}
                  onChange={(v) => set("blokirOtomatis", v)}
                />
              </div>
            </PanelBody>
          </Panel>

          <Panel className="lg:col-span-3">
            <PanelHeader
              title="Lokasi"
              hint="Koordinat menentukan posisi pin pada peta monitoring."
            />
            <PanelBody className="grid grid-cols-1 gap-4 sm:grid-cols-2">
              <Field label="Alamat" htmlFor="alamat" className="sm:col-span-2">
                <TextareaInput
                  id="alamat"
                  rows={2}
                  placeholder="Jl. Melati No. 12"
                  value={form.alamat}
                  onChange={(e) => set("alamat", e.target.value)}
                />
              </Field>

              <Field
                label="Kecamatan"
                htmlFor="kecamatan"
                error={errors.kecamatan}
                required
              >
                <TextInput
                  id="kecamatan"
                  list="kecamatan-list"
                  value={form.kecamatan}
                  invalid={!!errors.kecamatan}
                  placeholder="Sidorejo"
                  onChange={(e) => set("kecamatan", e.target.value)}
                />
                <datalist id="kecamatan-list">
                  {(kecamatanOptions.data ?? []).map((k) => (
                    <option key={k} value={k} />
                  ))}
                </datalist>
              </Field>

              <Field label="Kota / kabupaten" htmlFor="kota">
                <TextInput
                  id="kota"
                  value={form.kota}
                  onChange={(e) => set("kota", e.target.value)}
                />
              </Field>

              <Field label="Provinsi" htmlFor="provinsi">
                <TextInput id="provinsi" maxLength={100} value={form.provinsi} onChange={(e) => set("provinsi", e.target.value)} />
              </Field>

              <Field label="Kode pos" htmlFor="kodepos">
                <TextInput id="kodepos" mono maxLength={20} value={form.kodePos} onChange={(e) => set("kodePos", e.target.value)} />
              </Field>

              <Field label="NPWP" htmlFor="npwp" hint="Untuk tagihan dan laporan pelanggan.">
                <TextInput id="npwp" mono maxLength={30} value={form.npwp} onChange={(e) => set("npwp", e.target.value)} />
              </Field>

              <Field label="Email penagihan" htmlFor="email" error={errors.email}>
                <TextInput id="email" type="email" maxLength={255} value={form.email} invalid={!!errors.email} onChange={(e) => set("email", e.target.value)} />
              </Field>

              {/*
                0 in either field means "no pin yet" (see EMPTY above and
                outletApi.http.ts's write path), so it is shown as an empty
                box rather than a coordinate off the coast of Africa that
                looks like a real, if odd, answer.
              */}
              <Field
                label="Lintang"
                htmlFor="lat"
                hint={form.lat === 0 && form.lng === 0 ? "Belum dipetakan, jadi pangkalan ini tidak bisa masuk rute otomatis." : undefined}
              >
                <TextInput
                  id="lat"
                  type="number"
                  step="0.00001"
                  mono
                  value={form.lat === 0 && form.lng === 0 ? "" : form.lat}
                  onChange={(e) => set("lat", e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </Field>

              <Field label="Bujur" htmlFor="lng">
                <TextInput
                  id="lng"
                  type="number"
                  step="0.00001"
                  mono
                  value={form.lat === 0 && form.lng === 0 ? "" : form.lng}
                  onChange={(e) => set("lng", e.target.value === "" ? 0 : Number(e.target.value))}
                />
              </Field>

              <Field
                label="Tempel koordinat"
                htmlFor="coord-paste"
                error={coordPasteError}
                hint="Format dari “Salin koordinat” Google Maps: lintang, bujur."
                className="sm:col-span-2"
              >
                <div className="flex gap-2">
                  <TextInput
                    id="coord-paste"
                    mono
                    placeholder="-7.3305, 110.5084"
                    value={coordPaste}
                    invalid={!!coordPasteError}
                    onChange={(e) => {
                      setCoordPaste(e.target.value);
                      setCoordPasteError(undefined);
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Enter") {
                        e.preventDefault();
                        applyCoordPaste();
                      }
                    }}
                  />
                  <Button type="button" variant="outline" onClick={applyCoordPaste}>
                    Terapkan
                  </Button>
                </div>
              </Field>

              <LocationPicker
                lat={form.lat}
                lng={form.lng}
                onChange={(lat, lng) => {
                  set("lat", lat);
                  set("lng", lng);
                }}
              />
            </PanelBody>
          </Panel>
        </div>

        <div className="mt-4 flex flex-wrap items-center justify-end gap-2">
          <Button asChild variant="outline" type="button">
            <Link to="/outlet">Batal</Link>
          </Button>
          <Button type="submit" disabled={saveMutation.isPending}>
            {saveMutation.isPending ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <Save className="h-4 w-4" />
            )}
            {isEdit ? "Simpan perubahan" : `Daftarkan ${outletLabel()}`}
          </Button>
        </div>
      </form>
    </div>
  );
}
