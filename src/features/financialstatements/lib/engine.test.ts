import { describe, expect, it } from "vitest";
import { seedAccounts } from "@/mocks/ledger";
import type { AccountEntity, Database, JournalEntity, JournalSourceType } from "@/types/domain";
import { computeBalanceSheet, computeNotes, computeProfitAndLoss } from "./engine";
import { labaRugiLayout, neracaLayout } from "./layouts";

/**
 * The same two independent fixtures fortius-backend's own
 * internal/usecase/financialstatement/services_test.go uses, built against
 * this file's own engine instead. Golden figures are the financial-
 * statements plan's own §G, read off the client's real FY2025 statements.
 */

function db(accounts: AccountEntity[], journals: JournalEntity[]): Database {
  return { accounts, journals } as Database;
}

let journalCounter = 0;
function journal(
  accounts: AccountEntity[],
  tanggal: string,
  sumber: JournalSourceType,
  lines: { code: string; debit?: number; kredit?: number }[],
): JournalEntity {
  journalCounter++;
  return {
    id: `jv-${journalCounter}`,
    nomor: `JV-${String(journalCounter).padStart(4, "0")}`,
    tanggal,
    keterangan: "fixture",
    sumber: { tipe: sumber, id: "fixture" },
    status: "Diposting",
    dibuatOleh: "fixture",
    dibuatPada: tanggal,
    tenantId: "t1",
    branchId: "b1",
    version: 1,
    lines: lines.map((l) => {
      const account = accounts.find((a) => a.kode === l.code);
      if (!account) throw new Error(`fixture: no account ${l.code}`);
      return { akunId: account.id, debit: l.debit ?? 0, kredit: l.kredit ?? 0 };
    }),
  };
}

function round(n: number): number {
  return Math.round(n * 100) / 100;
}

describe("computeProfitAndLoss reproduces FY2025 page 1", () => {
  const accounts = seedAccounts();
  const journals: JournalEntity[] = [
    journal(accounts, "2024-12-31", "manual", [
      { code: "1-1300", debit: 101_595_000 },
      { code: "3-9000", kredit: 101_595_000 },
    ]),
    journal(accounts, "2025-06-01", "purchase", [
      { code: "1-1300", debit: 570_835_060 },
      { code: "2-1000", kredit: 570_835_060 },
    ]),
    journal(accounts, "2025-12-31", "manual", [
      { code: "5-1000", debit: 580_160_200 },
      { code: "1-1300", kredit: 580_160_200 },
    ]),
    journal(accounts, "2025-01-15", "manual", [
      { code: "1-1200", debit: 536_428_000 + 273_928_000 + 18_810_104 + 281_547 + 1_552_000 },
      { code: "4-1100", kredit: 536_428_000 },
      { code: "4-1000", kredit: 273_928_000 },
      { code: "4-2000", kredit: 18_810_104 },
      { code: "4-3100", kredit: 281_547 },
      { code: "4-3900", kredit: 1_552_000 },
    ]),
    journal(accounts, "2025-02-01", "manual", [
      {
        code: "1-1000",
        kredit:
          20_000 + 1_400_000 + 14_757_467 + 3_850_000 + 125_000 + 1_115_000 + 8_927_000 +
          18_472_300 + 199_263 + 41_750_000 + 69_000_000 + 11_111_111 + 42_032 + 2_914_130,
      },
      { code: "5-2000", debit: 20_000 },
      { code: "5-3100", debit: 1_400_000 },
      { code: "5-4100", debit: 14_757_467 },
      { code: "5-4200", debit: 3_850_000 },
      { code: "5-4300", debit: 125_000 },
      { code: "5-3300", debit: 1_115_000 },
      { code: "5-3900", debit: 8_927_000 },
      { code: "5-5100", debit: 18_472_300 },
      { code: "5-5300", debit: 199_263 },
      { code: "5-5200", debit: 41_750_000 },
      { code: "5-5400", debit: 69_000_000 },
      { code: "5-5500", debit: 11_111_111 },
      { code: "5-6200", debit: 42_032 },
      { code: "5-6100", debit: 2_914_130 },
    ]),
  ];

  const stmt = computeProfitAndLoss(db(accounts, journals), "2025-01-01", "2025-12-31", labaRugiLayout);

  it("reproduces every golden line", () => {
    const want: Record<string, number> = {
      pendaftaran: 536_428_000,
      isi_tabung: 273_928_000,
      total_penjualan: 810_356_000,
      pengiriman: -20_000,
      bbm: -1_400_000,
      logistik_domestik: -1_420_000,
      penjualan_bersih: 808_936_000,
      persediaan_awal: 101_595_000,
      pembelian: 570_835_060,
      persediaan_akhir: -92_269_860,
      perubahan_persediaan: 580_160_200,
      value_added: 228_775_800,
      hrga: -28_774_467,
      ebitda: 200_001_333,
      da: -140_532_674,
      pdlu: 20_643_651,
      bdlu: -2_956_162,
      laba_bersih: 77_156_148,
    };
    const byCode = new Map(stmt.lines.map((l) => [l.code, l.amount]));
    for (const [code, expected] of Object.entries(want)) {
      expect(round(byCode.get(code) ?? NaN), `line ${code}`).toBe(round(expected));
    }
  });

  it("reproduces the golden ratios", () => {
    const byCode = new Map(stmt.lines.map((l) => [l.code, l.ratio]));
    expect(byCode.get("value_added")).toBe(0.28);
    expect(byCode.get("hrga")).toBe(-0.04);
    expect(byCode.get("laba_bersih")).toBe(0.1);
  });

  it("has no warnings on a fully-mapped, reconciled fixture", () => {
    expect(stmt.warnings).toEqual([]);
  });
});

describe("computeBalanceSheet and computeNotes reproduce pages 2-3", () => {
  const accounts = seedAccounts();
  const journals: JournalEntity[] = [
    journal(accounts, "2025-12-31", "manual", [
      { code: "1-1100", debit: 7_440_199 + 31_467_702 },
      { code: "1-1300", debit: 90_709_860 },
      { code: "1-1311", debit: 750_000 },
      { code: "1-1312", debit: 810_000 },
      { code: "1-1210", debit: 25_000_000 },
      { code: "1-1250", debit: 18_810_104 },
      { code: "1-1400", debit: 150_000_000 + 6_987_000 },
      { code: "1-1500", debit: 11_111_111 },
      { code: "1-1600", debit: 4_525_977 },
      { code: "1-2100", debit: 369_446_000 },
      { code: "1-2200", debit: 334_000_000 },
      { code: "1-2300", debit: 9_564_625 },
      { code: "1-2900", kredit: 75_945_888 },
      { code: "1-3100", debit: 690_000_000 },
      { code: "1-3900", kredit: 92_000_000 },

      { code: "2-1000", kredit: 12_670_000 },
      { code: "2-1100", kredit: 7_023_400 },
      { code: "2-1310", kredit: 3_333_333 },
      { code: "2-1900", kredit: 5_971_000 },

      { code: "3-1000", kredit: 782_183_410 + 742_860_090 },
      { code: "3-2000", debit: 48_520_691 },

      { code: "4-1100", kredit: 536_428_000 },
      { code: "4-1000", kredit: 273_928_000 },
      { code: "4-2000", kredit: 18_810_104 },
      { code: "4-3100", kredit: 281_547 },
      { code: "4-3900", kredit: 1_552_000 },

      { code: "5-1000", debit: 580_160_200 },
      { code: "5-2000", debit: 20_000 },
      { code: "5-3100", debit: 1_400_000 },
      { code: "5-4100", debit: 14_757_467 },
      { code: "5-4200", debit: 3_850_000 },
      { code: "5-4300", debit: 125_000 },
      { code: "5-3300", debit: 1_115_000 },
      { code: "5-3900", debit: 8_927_000 },
      { code: "5-5100", debit: 18_472_300 },
      { code: "5-5300", debit: 199_263 },
      { code: "5-5200", debit: 41_750_000 },
      { code: "5-5400", debit: 69_000_000 },
      { code: "5-5500", debit: 11_111_111 },
      { code: "5-6200", debit: 42_032 },
      { code: "5-6100", debit: 2_914_130 },
    ]),
  ];

  const database = db(accounts, journals);
  const stmt = computeBalanceSheet(database, "2025-12-31", neracaLayout);

  it("balances", () => {
    expect(stmt.balanced).toBe(true);
    expect(stmt.warnings).toEqual([]);
  });

  it("reproduces every golden line", () => {
    const want: Record<string, number> = {
      kas: 38_907_901,
      persediaan: 92_269_860,
      piutang_usaha: 43_810_104,
      piutang_lain: 156_987_000,
      sewa_dimuka: 11_111_111,
      uang_muka: 4_525_977,
      jumlah_aset_lancar: 347_611_953,
      aset_tetap_bruto: 713_010_625,
      akumulasi: -75_945_888,
      jumlah_aset_tetap: 637_064_737,
      jumlah_atb: 598_000_000,
      total_aset: 1_582_676_690,
      jumlah_kewajiban: 28_997_733,
      jumlah_ekuitas: 1_553_678_957,
      total_kewajiban_ekuitas: 1_582_676_690,
      laba_ditahan: -48_520_691,
      laba_berjalan: 77_156_148,
    };
    const byCode = new Map(stmt.lines.map((l) => [l.code, l.amount]));
    for (const [code, expected] of Object.entries(want)) {
      expect(round(byCode.get(code) ?? NaN), `line ${code}`).toBe(round(expected));
    }
  });

  it("reproduces every golden note total", () => {
    const notes = computeNotes(database, "2025-12-31", neracaLayout);
    const want: Record<number, number> = {
      1: 38_907_901, 2: 92_269_860, 3: 43_810_104, 4: 156_987_000,
      5: 11_111_111, 6: 4_525_977, 7: 12_670_000, 8: 7_023_400,
      9: 3_333_333, 10: 5_971_000, 11: 1_525_043_500, 12: -48_520_691,
    };
    const byNumber = new Map(notes.notes.map((n) => [n.noteNumber, n.total]));
    for (const [number, expected] of Object.entries(want)) {
      expect(round(byNumber.get(Number(number)) ?? NaN), `note ${number}`).toBe(round(expected));
    }
    expect(notes.notes).toHaveLength(12);
  });
});
