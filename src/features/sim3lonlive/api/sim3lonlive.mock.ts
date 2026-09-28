/**
 * The live SIM3LON view, for the mock (demo) build.
 *
 * There is no backend here, so this returns a small, deliberately ANONYMIZED
 * snapshot in the exact shape the real API produces. The names are invented
 * ("Pangkalan Demo A") so the demo build never ships a real agent's operational
 * data. `sync` just returns a snapshot stamped now, so the "Sinkronkan" button
 * visibly does something in the demo.
 */
import type {
  MatrixRow,
  Section,
  Sim3lonLiveApi,
  Sim3lonSnapshot,
} from "./contract";

const DAYS = 30;
const FAKULTATIF_DAYS = new Set([6, 13, 20, 27]); // Sundays-ish, as SIM3LON marks

function matrixRow(
  idRegistrasi: string,
  namaPangkalan: string,
  alokasi: number,
  perNormal: number,
): MatrixRow {
  const days = Array.from({ length: DAYS }, (_, i) => {
    const day = i + 1;
    const fakultatif = FAKULTATIF_DAYS.has(day);
    // A simple believable rhythm: deliver on ~every third normal day.
    const delivering = !fakultatif && day % 3 === 2;
    return {
      day,
      fakultatif,
      status: fakultatif ? null : delivering ? 2 : 0,
      qty: delivering ? perNormal : 0,
      flag: fakultatif ? 1 : 0,
    };
  });
  const totalNormal = days.reduce((s, d) => s + d.qty, 0);
  return {
    idRegistrasi,
    namaPangkalan,
    status: "AKTIF",
    alokasi,
    days,
    totalNormal,
    totalFakultatif: 0,
    sisaAlokasi: alokasi - totalNormal,
    grandTotal: totalNormal,
  };
}

function matrixSection(label: string): Section {
  const rows = [
    matrixRow("45071099999900001", "Pangkalan Demo A", 800, 60),
    matrixRow("45072099999900002", "Pangkalan Demo B", 700, 50),
    matrixRow("45073099999900003", "Pangkalan Demo C", 900, 70),
  ];
  return {
    label,
    kind: "matrix",
    days: Array.from({ length: DAYS }, (_, i) => ({
      day: i + 1,
      fakultatif: FAKULTATIF_DAYS.has(i + 1),
    })),
    rows,
    recordsTotal: rows.length,
  };
}

function buildSnapshot(period: string): Sim3lonSnapshot {
  return {
    syncedAt: new Date().toISOString(),
    period,
    wilayah: { id: "0000", name: "KOTA DEMO" },
    sections: {
      perencanaan: matrixSection("Perencanaan"),
      penyaluran: matrixSection("Penyaluran"),
      "penerimaan-agen": {
        label: "Penerimaan Agen",
        kind: "table",
        columns: ["tanggal", "noSO", "noLO", "nmMaterial", "qtyPcs", "qtyKg"],
        rows: [
          { tanggal: `${period}-01`, noSO: "0000000001", noLO: "8000000001", nmMaterial: "REFILL/ISI LPG @3KG (NET)", qtyPcs: 360, qtyKg: 1080 },
          { tanggal: `${period}-02`, noSO: "0000000001", noLO: "8000000002", nmMaterial: "REFILL/ISI LPG @3KG (NET)", qtyPcs: 560, qtyKg: 1680 },
          { tanggal: `${period}-03`, noSO: "0000000001", noLO: "8000000003", nmMaterial: "REFILL/ISI LPG @3KG (NET)", qtyPcs: 360, qtyKg: 1080 },
        ],
        recordsTotal: 3,
      },
      pangkalan: {
        label: "Pangkalan",
        kind: "table",
        columns: ["idRegistrasi", "nmPangkalan", "namaKota", "namaKecamatan", "status"],
        rows: [
          { idRegistrasi: "45071099999900001", nmPangkalan: "Pangkalan Demo A", namaKota: "KOTA DEMO", namaKecamatan: "DEMO UTARA", status: "AKTIF" },
          { idRegistrasi: "45072099999900002", nmPangkalan: "Pangkalan Demo B", namaKota: "KOTA DEMO", namaKecamatan: "DEMO SELATAN", status: "AKTIF" },
          { idRegistrasi: "45073099999900003", nmPangkalan: "Pangkalan Demo C", namaKota: "KOTA DEMO", namaKecamatan: "DEMO TENGAH", status: "AKTIF" },
        ],
        recordsTotal: 3,
      },
      pesanan: { label: "Pesanan", kind: "table", columns: [], rows: [], recordsTotal: 0 },
      "stok-harian": { label: "Stok Harian", kind: "table", columns: [], rows: [], recordsTotal: 0 },
      "harga-harian": { label: "Harga Harian", kind: "table", columns: [], rows: [], recordsTotal: 0 },
      "inout-agen": {
        label: "In/Out Agen",
        kind: "grid",
        columns: ["Field", ...Array.from({ length: DAYS }, (_, i) => String(i + 1).padStart(2, "0"))],
        rows: [
          ["StokAwal", ...Array.from({ length: DAYS }, () => 0)],
          ["Penerimaan", ...Array.from({ length: DAYS }, (_, i) => (i % 3 === 0 ? 360 : 0))],
        ],
        recordsTotal: 2,
      },
    },
  };
}

function currentPeriod(): string {
  const now = new Date();
  return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}`;
}

export const sim3lonLiveMock: Sim3lonLiveApi = {
  getSnapshot: (period) => Promise.resolve(buildSnapshot(period || currentPeriod())),
  sync: (period) => Promise.resolve(buildSnapshot(period || currentPeriod())),
};
