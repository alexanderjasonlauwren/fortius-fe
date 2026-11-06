import type { SettingsEntity } from "@/types/domain";

/**
 * Neutral defaults for the fields this adapter does not read.
 *
 * `iam.tenant_settings` covers the lexicon and the operating window;
 * `iam.tenant_profiles` covers legal identity. SettingsEntity is wider than
 * both — numbering, notification rules (the Notifikasi panel reads those from
 * `/reminder-settings` itself), theme. The HTTP adapter merges over these
 * rather than leaving them undefined and letting a screen render blank.
 *
 * The lexicon falls back to colourless words on purpose. A brand-new session
 * shows these for the moment before settings load, and a neutral noun is better
 * than a confidently wrong industry's.
 */
export const DEFAULT_SETTINGS: SettingsEntity = {
  namaPerusahaan: "—",
  nomorAgen: "—",
  alamat: "—",
  telepon: "—",
  email: "—",
  namaLegal: "—",
  nomorRegistrasi: "—",
  npwp: "—",
  pkp: false,
  tarifPajakDefault: 0,
  zonaWaktu: "Asia/Jakarta",
  penandatanganNama: "",
  penandatanganJabatan: "",
  jamOperasionalMulai: "06:00",
  jamOperasionalSelesai: "18:00",
  istilah: { satuan: "unit", outlet: "outlet", pemasok: "pemasok" },
  targetHarian: 0,
  notifikasi: { rules: {} } as SettingsEntity["notifikasi"],
  penomoran: {} as SettingsEntity["penomoran"],
  operasi: {
    rekamLokasi: false,
    radiusGeofenceMeter: 150,
    hariKerja: [1, 2, 3, 4, 5, 6],
    durasiSinggahMenit: 15,
    leadTimeHari: 1,
  },
  tema: "sistem",
};
