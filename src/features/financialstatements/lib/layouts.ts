/**
 * The two statement layouts, ported line for line from fortius-backend's
 * own seed (internal/service/tenantprovisioning/layouts.go) -- same codes,
 * same labels, same formulas, same account mappings. Financial-statements
 * plan, phase P2.
 *
 * `parent` is display indentation only. `formula`/`accounts` are the
 * dependency graph the engine actually evaluates -- see engine.ts's own
 * doc for why the two are not the same order (several PDF subtotals print
 * before the lines that make them up).
 */
import type { StatementLineKind } from "../api/contract";

export interface FormulaTerm {
  code: string;
  sign: 1 | -1;
}

export interface LayoutLineDef {
  code: string;
  label: string;
  parent?: string;
  lineKind: StatementLineKind;
  displaySign?: 1 | -1;
  formula?: FormulaTerm[];
  accounts?: string[];
  ratioBase?: string;
  showRatio?: boolean;
  noteNumber?: number;
  isBold?: boolean;
  hideWhenZero?: boolean;
}

export interface LayoutDef {
  code: string;
  name: string;
  kind: "profit_loss" | "balance_sheet";
  lines: LayoutLineDef[];
}

function plus(...codes: string[]): FormulaTerm[] {
  return codes.map((code) => ({ code, sign: 1 as const }));
}
function minus(...codes: string[]): FormulaTerm[] {
  return codes.map((code) => ({ code, sign: -1 as const }));
}

export const labaRugiLayout: LayoutDef = {
  code: "laba_rugi",
  name: "Laporan Laba Rugi",
  kind: "profit_loss",
  lines: [
    { code: "penjualan", label: "PENJUALAN", lineKind: "header" },
    { code: "pendaftaran", label: "Pendaftaran Pangkalan", parent: "penjualan", lineKind: "accounts", accounts: ["4-1100"] },
    { code: "isi_tabung", label: "Penjualan Isi Tabung", parent: "penjualan", lineKind: "accounts", accounts: ["4-1000", "4-1900"] },
    { code: "total_penjualan", label: "Total Penjualan", parent: "penjualan", lineKind: "subtotal", formula: plus("pendaftaran", "isi_tabung"), isBold: true },

    { code: "biaya_logistik_header", label: "Biaya Logistik", lineKind: "header" },
    { code: "logistik_domestik", label: "Logistik Domestik", parent: "biaya_logistik_header", lineKind: "subtotal", formula: plus("pengiriman", "bbm"), isBold: true },
    { code: "pengiriman", label: "Biaya Pengiriman Ke Customer", parent: "logistik_domestik", lineKind: "accounts", accounts: ["5-2000"], displaySign: -1 },
    { code: "bbm", label: "BBM, Parkir, Tol", parent: "logistik_domestik", lineKind: "accounts", accounts: ["5-3100", "5-3200", "5-3400"], displaySign: -1 },

    { code: "penjualan_bersih", label: "Penjualan Bersih", lineKind: "subtotal", formula: plus("total_penjualan", "logistik_domestik"), isBold: true },

    { code: "perubahan_persediaan", label: "Perubahan Persediaan Barang", lineKind: "inventory_change", accounts: ["1-1300", "1-1310"], isBold: true },
    { code: "persediaan_awal", label: "Persediaan Awal", parent: "perubahan_persediaan", lineKind: "inventory_opening" },
    { code: "pembelian", label: "Pembelian", parent: "perubahan_persediaan", lineKind: "inventory_purchases" },
    { code: "persediaan_akhir", label: "Persediaan Akhir", parent: "perubahan_persediaan", lineKind: "inventory_closing", displaySign: -1 },

    { code: "value_added", label: "Value Added", lineKind: "subtotal", formula: [...plus("penjualan_bersih"), ...minus("perubahan_persediaan")], isBold: true, showRatio: true, ratioBase: "total_penjualan" },

    { code: "umum_adm", label: "Umum dan Administrasi", lineKind: "header" },
    { code: "hrga", label: "HR & GA", parent: "umum_adm", lineKind: "subtotal", formula: plus("gaji", "atk", "iuran", "perbaikan", "lainnya"), isBold: true, showRatio: true, ratioBase: "total_penjualan" },
    { code: "gaji", label: "Gaji Pokok Staff", parent: "hrga", lineKind: "accounts", accounts: ["5-4100"], displaySign: -1 },
    { code: "atk", label: "ATK & Keperluan Kantor Lainnya", parent: "hrga", lineKind: "accounts", accounts: ["5-4200"], displaySign: -1 },
    { code: "iuran", label: "Iuran & Sumbangan", parent: "hrga", lineKind: "accounts", accounts: ["5-4300"], displaySign: -1 },
    { code: "perbaikan", label: "Perbaikan & Perawatan Kendaraan", parent: "hrga", lineKind: "accounts", accounts: ["5-3300"], displaySign: -1 },
    { code: "lainnya", label: "Biaya Lainnya", parent: "hrga", lineKind: "accounts", accounts: ["5-3900", "5-4400"], displaySign: -1 },

    { code: "ebitda", label: "EBITDA", lineKind: "subtotal", formula: plus("value_added", "hrga"), isBold: true },

    { code: "da", label: "Penyusutan & Amortisasi", lineKind: "subtotal", formula: plus("da_bangunan", "da_inventaris", "da_kendaraan", "da_perijinan", "da_sewa"), isBold: true },
    { code: "da_bangunan", label: "Biaya Penyusutan Bangunan", parent: "da", lineKind: "accounts", accounts: ["5-5100"], displaySign: -1 },
    { code: "da_inventaris", label: "Biaya Penyusutan Inventaris Kantor", parent: "da", lineKind: "accounts", accounts: ["5-5300"], displaySign: -1 },
    { code: "da_kendaraan", label: "Biaya Penyusutan Kendaraan", parent: "da", lineKind: "accounts", accounts: ["5-5200"], displaySign: -1 },
    { code: "da_perijinan", label: "Amortisasi Perijinan", parent: "da", lineKind: "accounts", accounts: ["5-5400"], displaySign: -1 },
    { code: "da_sewa", label: "Biaya Sewa Tanah", parent: "da", lineKind: "accounts", accounts: ["5-5500"], displaySign: -1 },

    { code: "pdlu", label: "Pendapatan Di Luar Usaha", lineKind: "subtotal", formula: plus("transport", "jasa_giro", "pendapatan_lain"), isBold: true },
    { code: "transport", label: "Transport Fee", parent: "pdlu", lineKind: "accounts", accounts: ["4-2000"] },
    { code: "jasa_giro", label: "Pendapatan jasa giro", parent: "pdlu", lineKind: "accounts", accounts: ["4-3100"] },
    { code: "pendapatan_lain", label: "Pendapatan Lain-lain", parent: "pdlu", lineKind: "accounts", accounts: ["4-3900"] },

    { code: "bdlu", label: "Biaya Di Luar Usaha", lineKind: "subtotal", formula: plus("pajak_giro", "adm_bank"), isBold: true },
    { code: "pajak_giro", label: "Biaya Pajak Jasa Giro", parent: "bdlu", lineKind: "accounts", accounts: ["5-6200"], displaySign: -1 },
    { code: "adm_bank", label: "Administrasi Bank", parent: "bdlu", lineKind: "accounts", accounts: ["5-6100"], displaySign: -1 },

    { code: "laba_bersih", label: "Laba Bersih", lineKind: "subtotal", formula: plus("ebitda", "da", "pdlu", "bdlu"), isBold: true, showRatio: true, ratioBase: "total_penjualan" },
  ],
};

export const neracaLayout: LayoutDef = {
  code: "neraca",
  name: "Neraca",
  kind: "balance_sheet",
  lines: [
    { code: "aset", label: "ASET", lineKind: "header" },
    { code: "aset_lancar", label: "ASET LANCAR", parent: "aset", lineKind: "header" },
    { code: "kas", label: "Kas dan Setara Kas", parent: "aset_lancar", lineKind: "accounts", accounts: ["1-1000", "1-1100"], noteNumber: 1 },
    { code: "persediaan", label: "Persediaan", parent: "aset_lancar", lineKind: "accounts", accounts: ["1-1300", "1-1310"], noteNumber: 2 },
    { code: "piutang_usaha", label: "Piutang Usaha", parent: "aset_lancar", lineKind: "accounts", accounts: ["1-1200", "1-1210", "1-1250"], noteNumber: 3 },
    { code: "piutang_lain", label: "Piutang Lain - lain", parent: "aset_lancar", lineKind: "accounts", accounts: ["1-1400"], noteNumber: 4 },
    { code: "sewa_dimuka", label: "Sewa Dibayar Dimuka", parent: "aset_lancar", lineKind: "accounts", accounts: ["1-1500"], noteNumber: 5 },
    { code: "uang_muka", label: "Uang Muka Pembelian & Jaminan", parent: "aset_lancar", lineKind: "accounts", accounts: ["1-1600"], noteNumber: 6 },
    { code: "jumlah_aset_lancar", label: "Jumlah Aset Lancar", parent: "aset_lancar", lineKind: "subtotal", formula: plus("kas", "persediaan", "piutang_usaha", "piutang_lain", "sewa_dimuka", "uang_muka"), isBold: true },

    { code: "aset_tetap", label: "ASET TETAP", parent: "aset", lineKind: "header" },
    { code: "bangunan", label: "Bangunan", parent: "aset_tetap", lineKind: "accounts", accounts: ["1-2100"] },
    { code: "kendaraan", label: "Kendaraan", parent: "aset_tetap", lineKind: "accounts", accounts: ["1-2200"] },
    { code: "inventaris", label: "Inventaris Kantor", parent: "aset_tetap", lineKind: "accounts", accounts: ["1-2300"] },
    { code: "aset_tetap_bruto", label: "", parent: "aset_tetap", lineKind: "subtotal", formula: plus("bangunan", "kendaraan", "inventaris") },
    { code: "akumulasi", label: "Akumulasi Penyusutan", parent: "aset_tetap", lineKind: "accounts", accounts: ["1-2900"] },
    { code: "jumlah_aset_tetap", label: "Jumlah Aset Tetap", parent: "aset_tetap", lineKind: "subtotal", formula: plus("aset_tetap_bruto", "akumulasi"), isBold: true },

    { code: "atb", label: "ASET TIDAK BERWUJUD", parent: "aset", lineKind: "header" },
    { code: "perijinan", label: "Perijinan", parent: "atb", lineKind: "accounts", accounts: ["1-3100"] },
    { code: "amortisasi", label: "Amortisasi", parent: "atb", lineKind: "accounts", accounts: ["1-3900"] },
    { code: "jumlah_atb", label: "Jumlah Aset Tidak Berwujud", parent: "atb", lineKind: "subtotal", formula: plus("perijinan", "amortisasi"), isBold: true },

    { code: "total_aset", label: "TOTAL ASET", parent: "aset", lineKind: "subtotal", formula: plus("jumlah_aset_lancar", "jumlah_aset_tetap", "jumlah_atb"), isBold: true },

    { code: "kewajiban_ekuitas", label: "KEWAJIBAN & EKUITAS", lineKind: "header" },
    { code: "kewajiban_lancar", label: "KEWAJIBAN LANCAR", parent: "kewajiban_ekuitas", lineKind: "header" },
    { code: "hutang_dagang", label: "Hutang Dagang", parent: "kewajiban_lancar", lineKind: "accounts", accounts: ["2-1000"], noteNumber: 7 },
    { code: "hutang_titipan", label: "Hutang Titipan", parent: "kewajiban_lancar", lineKind: "accounts", accounts: ["2-1100"], noteNumber: 8 },
    { code: "hutang_pajak", label: "Hutang Pajak", parent: "kewajiban_lancar", lineKind: "accounts", accounts: ["2-1200", "2-1300"], noteNumber: 9 },
    { code: "hutang_lain", label: "Hutang Lain - lain", parent: "kewajiban_lancar", lineKind: "accounts", accounts: ["2-1900"], noteNumber: 10 },
    { code: "jumlah_kewajiban", label: "Jumlah Kewajiban Lancar", parent: "kewajiban_lancar", lineKind: "subtotal", formula: plus("hutang_dagang", "hutang_titipan", "hutang_pajak", "hutang_lain"), isBold: true },

    { code: "ekuitas", label: "EKUITAS", parent: "kewajiban_ekuitas", lineKind: "header" },
    { code: "modal", label: "Modal Disetor", parent: "ekuitas", lineKind: "accounts", accounts: ["3-1000"], noteNumber: 11 },
    { code: "laba_ditahan", label: "Laba Ditahan", parent: "ekuitas", lineKind: "retained_earnings", accounts: ["3-2000"], noteNumber: 12 },
    { code: "laba_berjalan", label: "Laba Rugi Tahun Berjalan", parent: "ekuitas", lineKind: "current_year_earnings" },
    { code: "saldo_awal_ekuitas", label: "Saldo Awal Ekuitas", parent: "ekuitas", lineKind: "accounts", accounts: ["3-9000"], hideWhenZero: true },
    { code: "jumlah_ekuitas", label: "Jumlah Ekuitas", parent: "ekuitas", lineKind: "subtotal", formula: plus("modal", "laba_ditahan", "laba_berjalan", "saldo_awal_ekuitas"), isBold: true },

    { code: "total_kewajiban_ekuitas", label: "TOTAL KEWAJIBAN & EKUITAS", parent: "kewajiban_ekuitas", lineKind: "subtotal", formula: plus("jumlah_kewajiban", "jumlah_ekuitas"), isBold: true },
  ],
};

export const layouts: LayoutDef[] = [labaRugiLayout, neracaLayout];

export function layoutByCode(code: string): LayoutDef | undefined {
  return layouts.find((l) => l.code === code);
}

export function defaultLayout(kind: "profit_loss" | "balance_sheet"): LayoutDef {
  const found = layouts.find((l) => l.kind === kind);
  if (!found) throw new Error(`No default layout for kind ${kind}`);
  return found;
}
