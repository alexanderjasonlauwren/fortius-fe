/**
 * The general ledger: chart of accounts and double-entry posting.
 *
 * Every event that moves money posts a balanced journal here. Reports are then
 * derived from the ledger rather than recomputed from operational tables, which
 * is what makes the finance figures reconcilable instead of merely plausible.
 */

import { nextId } from "./db";
import { stampScope } from "./scope";
import type {
  AccountEntity,
  AccountRole,
  Database,
  ID,
  JournalEntity,
  JournalLine,
  JournalSourceType,
} from "./types";
import { unitLabelTitle } from "@/lib/lexicon";

/* ── chart of accounts ─────────────────────────────────────────────────── */

type Seed = Omit<AccountEntity, "id"> & { id?: ID };

/** A small Indonesian chart, enough to close a period for a distribution agency. */
const CHART: Seed[] = [
  // Aset
  { kode: "1-0000", nama: "ASET", tipe: "Aset", saldoNormal: "debit", sistem: true, aktif: true },
  { kode: "1-1000", nama: "Kas", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", role: "kas", sistem: true, aktif: true },
  { kode: "1-1100", nama: "Bank", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", role: "bank", sistem: true, aktif: true },
  { kode: "1-1200", nama: "Piutang Usaha", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", role: "piutang", sistem: true, aktif: true },
  { kode: "1-1300", nama: `Persediaan ${unitLabelTitle()}`, tipe: "Aset", saldoNormal: "debit", induk: "1-0000", role: "persediaan", sistem: true, aktif: true },
  // The transportation-fee stream's own receivable, distinct from 1-1200 --
  // mirrors fortius-backend's own pre-chart-v2 1-1250 (tenantprovisioning/
  // chart.go), missing here until the financial-statements plan's own
  // ported layouts (phase P2) needed it to render Piutang Usaha's Note 3.
  { kode: "1-1250", nama: "Piutang Transport Fee", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", role: "piutangTransportFee", sistem: true, aktif: true },

  // Kewajiban
  { kode: "2-0000", nama: "KEWAJIBAN", tipe: "Kewajiban", saldoNormal: "kredit", sistem: true, aktif: true },
  { kode: "2-1000", nama: "Utang Usaha", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-0000", sistem: true, aktif: true },
  { kode: "2-1200", nama: "PPN Keluaran", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-0000", role: "ppnKeluaran", sistem: true, aktif: true },

  // Ekuitas
  { kode: "3-0000", nama: "EKUITAS", tipe: "Ekuitas", saldoNormal: "kredit", sistem: true, aktif: true },
  { kode: "3-1000", nama: "Modal Disetor", tipe: "Ekuitas", saldoNormal: "kredit", induk: "3-0000", sistem: true, aktif: true },
  { kode: "3-2000", nama: "Laba Ditahan", tipe: "Ekuitas", saldoNormal: "kredit", induk: "3-0000", role: "labaDitahan", sistem: true, aktif: true },

  // Pendapatan
  { kode: "4-0000", nama: "PENDAPATAN", tipe: "Pendapatan", saldoNormal: "kredit", sistem: true, aktif: true },
  { kode: "4-1000", nama: "Penjualan", tipe: "Pendapatan", saldoNormal: "kredit", induk: "4-0000", role: "pendapatan", sistem: true, aktif: true },
  { kode: "4-1900", nama: "Retur & Potongan Penjualan", tipe: "Pendapatan", saldoNormal: "debit", induk: "4-0000", role: "returPenjualan", sistem: true, aktif: true },
  // Mirrors fortius-backend's own pre-chart-v2 4-2000; see 1-1250's own
  // comment above.
  { kode: "4-2000", nama: "Pendapatan Transport Fee", tipe: "Pendapatan", saldoNormal: "kredit", induk: "4-0000", role: "pendapatanTransportFee", sistem: true, aktif: true },

  // Beban
  { kode: "5-0000", nama: "BEBAN", tipe: "Beban", saldoNormal: "debit", sistem: true, aktif: true },
  { kode: "5-1000", nama: "Harga Pokok Penjualan", tipe: "Beban", saldoNormal: "debit", induk: "5-0000", role: "hpp", sistem: true, aktif: true },
  { kode: "5-2000", nama: "Beban Angkut", tipe: "Beban", saldoNormal: "debit", induk: "5-0000", sistem: false, aktif: true },
  { kode: "5-3000", nama: "Beban Operasional", tipe: "Beban", saldoNormal: "debit", induk: "5-0000", sistem: false, aktif: true },
  // Pre-existing backend accounts (tenantprovisioning/chart.go's own D3
  // A-Step 4 expense-category roles) the mock chart never carried until the
  // financial-statements plan's ported layouts (phase P2) needed them.
  { kode: "5-3100", nama: "Beban Bahan Bakar", tipe: "Beban", saldoNormal: "debit", induk: "5-3000", role: "bebanBahanBakar", sistem: true, aktif: true },
  { kode: "5-3200", nama: "Beban Tol", tipe: "Beban", saldoNormal: "debit", induk: "5-3000", role: "bebanTol", sistem: true, aktif: true },
  { kode: "5-3300", nama: "Beban Pemeliharaan", tipe: "Beban", saldoNormal: "debit", induk: "5-3000", role: "bebanPemeliharaan", sistem: true, aktif: true },
  { kode: "5-3900", nama: "Beban Operasional Lainnya", tipe: "Beban", saldoNormal: "debit", induk: "5-3000", role: "bebanOperasionalLainnya", sistem: true, aktif: true },

  // Chart v2 (financial-statements plan, phase P1) -- ported from
  // fortius-backend's own tenantprovisioning/chart.go, same codes, same
  // names, same order, for the reason this file's own header gives: a
  // tenant provisioned by the backend and this mock database describe the
  // same ledger. Nothing posts to these yet (see each new AccountRole's own
  // comment in types/domain.ts) -- that lands with the phase that needs it.
  { kode: "1-1210", nama: "Piutang Pendaftaran Pangkalan", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", role: "piutangPendaftaran", sistem: true, aktif: true },
  { kode: "1-1310", nama: "Persediaan Perlengkapan Pangkalan", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", sistem: false, aktif: true },
  { kode: "1-1311", nama: "Persediaan Timbangan", tipe: "Aset", saldoNormal: "debit", induk: "1-1310", sistem: false, aktif: true },
  { kode: "1-1312", nama: "Persediaan Papan Pangkalan", tipe: "Aset", saldoNormal: "debit", induk: "1-1310", sistem: false, aktif: true },
  { kode: "1-1313", nama: "Persediaan APAR", tipe: "Aset", saldoNormal: "debit", induk: "1-1310", sistem: false, aktif: true },
  { kode: "1-1400", nama: "Piutang Lain - lain", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", sistem: false, aktif: true },
  { kode: "1-1500", nama: "Sewa Dibayar Dimuka", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", sistem: false, aktif: true },
  { kode: "1-1600", nama: "Uang Muka Pembelian & Jaminan", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", role: "uangMuka", sistem: true, aktif: true },
  { kode: "1-2000", nama: "ASET TETAP", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", sistem: false, aktif: true },
  { kode: "1-2100", nama: "Bangunan", tipe: "Aset", saldoNormal: "debit", induk: "1-2000", sistem: false, aktif: true },
  { kode: "1-2200", nama: "Kendaraan", tipe: "Aset", saldoNormal: "debit", induk: "1-2000", sistem: false, aktif: true },
  { kode: "1-2300", nama: "Inventaris Kantor", tipe: "Aset", saldoNormal: "debit", induk: "1-2000", sistem: false, aktif: true },
  { kode: "1-2900", nama: "Akumulasi Penyusutan", tipe: "Aset", saldoNormal: "kredit", induk: "1-2000", sistem: false, aktif: true },
  { kode: "1-3000", nama: "ASET TIDAK BERWUJUD", tipe: "Aset", saldoNormal: "debit", induk: "1-0000", sistem: false, aktif: true },
  { kode: "1-3100", nama: "Perijinan", tipe: "Aset", saldoNormal: "debit", induk: "1-3000", sistem: false, aktif: true },
  { kode: "1-3900", nama: "Akumulasi Amortisasi", tipe: "Aset", saldoNormal: "kredit", induk: "1-3000", sistem: false, aktif: true },

  { kode: "2-1100", nama: "Hutang Titipan", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-0000", role: "hutangTitipan", sistem: true, aktif: true },
  { kode: "2-1300", nama: "Hutang Pajak", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-0000", sistem: false, aktif: true },
  { kode: "2-1310", nama: "Hutang PPh 4(2)", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-1300", sistem: false, aktif: true },
  { kode: "2-1320", nama: "Hutang PPh 21", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-1300", sistem: false, aktif: true },
  { kode: "2-1330", nama: "Hutang PPh 23", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-1300", sistem: false, aktif: true },
  { kode: "2-1900", nama: "Hutang Lain - lain", tipe: "Kewajiban", saldoNormal: "kredit", induk: "2-0000", sistem: false, aktif: true },

  { kode: "3-9000", nama: "Saldo Awal Ekuitas", tipe: "Ekuitas", saldoNormal: "kredit", induk: "3-0000", role: "saldoAwalEkuitas", sistem: true, aktif: true },

  { kode: "4-1100", nama: "Pendapatan Pendaftaran Pangkalan", tipe: "Pendapatan", saldoNormal: "kredit", induk: "4-0000", role: "pendapatanPendaftaran", sistem: true, aktif: true },
  { kode: "4-3100", nama: "Pendapatan Jasa Giro", tipe: "Pendapatan", saldoNormal: "kredit", induk: "4-0000", role: "jasaGiro", sistem: true, aktif: true },
  { kode: "4-3900", nama: "Pendapatan Lain-lain", tipe: "Pendapatan", saldoNormal: "kredit", induk: "4-0000", role: "pendapatanLain", sistem: true, aktif: true },

  { kode: "5-1900", nama: "Selisih Persediaan", tipe: "Beban", saldoNormal: "debit", induk: "5-0000", role: "selisihPersediaan", sistem: true, aktif: true },
  { kode: "5-3400", nama: "Beban Parkir", tipe: "Beban", saldoNormal: "debit", induk: "5-3000", sistem: false, aktif: true },
  { kode: "5-4000", nama: "Beban Umum dan Administrasi", tipe: "Beban", saldoNormal: "debit", induk: "5-0000", sistem: false, aktif: true },
  { kode: "5-4100", nama: "Gaji Pokok Staff", tipe: "Beban", saldoNormal: "debit", induk: "5-4000", sistem: false, aktif: true },
  { kode: "5-4200", nama: "ATK & Keperluan Kantor Lainnya", tipe: "Beban", saldoNormal: "debit", induk: "5-4000", sistem: false, aktif: true },
  { kode: "5-4300", nama: "Iuran & Sumbangan", tipe: "Beban", saldoNormal: "debit", induk: "5-4000", sistem: false, aktif: true },
  { kode: "5-4400", nama: "Telepon & Internet", tipe: "Beban", saldoNormal: "debit", induk: "5-4000", sistem: false, aktif: true },
  { kode: "5-5000", nama: "Penyusutan & Amortisasi", tipe: "Beban", saldoNormal: "debit", induk: "5-0000", sistem: false, aktif: true },
  { kode: "5-5100", nama: "Biaya Penyusutan Bangunan", tipe: "Beban", saldoNormal: "debit", induk: "5-5000", sistem: false, aktif: true },
  { kode: "5-5200", nama: "Biaya Penyusutan Kendaraan", tipe: "Beban", saldoNormal: "debit", induk: "5-5000", sistem: false, aktif: true },
  { kode: "5-5300", nama: "Biaya Penyusutan Inventaris Kantor", tipe: "Beban", saldoNormal: "debit", induk: "5-5000", sistem: false, aktif: true },
  { kode: "5-5400", nama: "Amortisasi Perijinan", tipe: "Beban", saldoNormal: "debit", induk: "5-5000", sistem: false, aktif: true },
  { kode: "5-5500", nama: "Biaya Sewa Tanah", tipe: "Beban", saldoNormal: "debit", induk: "5-5000", sistem: false, aktif: true },
  { kode: "5-6000", nama: "Beban Di Luar Usaha", tipe: "Beban", saldoNormal: "debit", induk: "5-0000", sistem: false, aktif: true },
  { kode: "5-6100", nama: "Administrasi Bank", tipe: "Beban", saldoNormal: "debit", induk: "5-6000", role: "administrasiBank", sistem: true, aktif: true },
  { kode: "5-6200", nama: "Biaya Pajak Jasa Giro", tipe: "Beban", saldoNormal: "debit", induk: "5-6000", role: "pajakJasaGiro", sistem: true, aktif: true },
];

export function seedAccounts(): AccountEntity[] {
  return CHART.map((a, i) => ({ ...a, id: `acc-${String(i + 1).padStart(3, "0")}` }));
}

/**
 * Adds a plain, non-system account to the chart -- mirrors
 * fortius-backend's `account.CreateAccount`. Never a system account: those
 * exist only in the starting seed above, the same reasoning the backend's
 * own CreateAccountRequest gives for accepting no `role`/`is_system`.
 */
export function createAccount(
  db: Database,
  input: { kode: string; nama: string; tipe: AccountEntity["tipe"]; indukId?: ID; deskripsi?: string },
): AccountEntity {
  if (db.accounts.some((a) => a.kode === input.kode)) {
    throw new Error(`Akun dengan kode "${input.kode}" sudah ada.`);
  }
  const parent = input.indukId ? db.accounts.find((a) => a.id === input.indukId) : undefined;
  const account: AccountEntity = {
    id: nextId("acc"),
    kode: input.kode,
    nama: input.nama,
    tipe: input.tipe,
    saldoNormal: input.tipe === "Aset" || input.tipe === "Beban" ? "debit" : "kredit",
    induk: parent?.kode,
    sistem: false,
    aktif: true,
  };
  db.accounts.push(account);
  return account;
}

/**
 * Brings this database's chart up to the current `CHART` seed above --
 * mirrors fortius-backend's `tenantprovisioning.UpgradeChart` (financial-
 * statements plan, phase P1). Every mock database is already seeded from
 * the current `CHART` at creation (`seedAccounts`), so in practice this
 * finds nothing to add; it exists so the console's "Perbarui bagan akun"
 * button behaves identically against both adapters rather than only
 * existing in one of them.
 */
export function upgradeChart(
  db: Database,
  dryRun: boolean,
): { akunDitambahkan: string[]; konflik: { kode: string; alasan: string }[] } {
  const byCode = new Map(db.accounts.map((a) => [a.kode, a]));
  const akunDitambahkan: string[] = [];
  const konflik: { kode: string; alasan: string }[] = [];

  for (const seed of CHART) {
    const existing = byCode.get(seed.kode);
    if (existing) {
      if (existing.tipe !== seed.tipe) {
        konflik.push({
          kode: seed.kode,
          alasan: `sudah ada sebagai ${existing.tipe}, bagan standar mengharapkan ${seed.tipe}`,
        });
      }
      continue;
    }
    akunDitambahkan.push(seed.kode);
    if (!dryRun) {
      const account: AccountEntity = { ...seed, id: nextId("acc") };
      db.accounts.push(account);
      byCode.set(account.kode, account);
    }
  }
  return { akunDitambahkan, konflik };
}

/** Finds a posting account by role. Throws loudly — a missing role is a bug. */
export function accountByRole(db: Database, role: AccountRole): AccountEntity {
  const found = db.accounts.find((a) => a.role === role);
  if (!found) {
    throw new Error(
      `Akun dengan peran "${role}" tidak ada di bagan akun. Periksa Konfigurasi Sistem.`,
    );
  }
  return found;
}

/* ── posting ───────────────────────────────────────────────────────────── */

const round = (n: number) => Math.round(n * 100) / 100;

/**
 * Posts a balanced journal.
 *
 * Refuses to post if debits and credits disagree — an unbalanced ledger is
 * worse than no ledger, because every report downstream silently lies.
 */
export function postJournal(
  db: Database,
  input: {
    tanggal: string;
    keterangan: string;
    sumber: { tipe: JournalSourceType; id: ID };
    lines: JournalLine[];
    aktor: string;
    reversalDari?: ID;
    /** Defaults to the active branch; pass the source row's scope explicitly. */
    scope?: { tenantId: ID; branchId: ID };
  },
): JournalEntity {
  const lines = input.lines
    .map((l) => ({ ...l, debit: round(l.debit), kredit: round(l.kredit) }))
    .filter((l) => l.debit !== 0 || l.kredit !== 0);

  if (lines.length < 2) {
    throw new Error("Jurnal harus memiliki minimal dua baris.");
  }

  const totalDebit = round(lines.reduce((s, l) => s + l.debit, 0));
  const totalKredit = round(lines.reduce((s, l) => s + l.kredit, 0));
  if (totalDebit !== totalKredit) {
    throw new Error(
      `Jurnal tidak seimbang: debit ${totalDebit.toLocaleString("id-ID")} vs kredit ${totalKredit.toLocaleString("id-ID")}.`,
    );
  }

  const seq = db.journals.length + 1;
  const entry: JournalEntity = {
    // A journal carries the branch it was raised in, so one chart of accounts
    // yields both consolidated and per-branch reports.
    ...stampScope({}, input.scope),
    id: `jrn-${Date.now().toString(36)}${seq.toString(36)}`,
    nomor: `JV-${input.tanggal.replace(/-/g, "")}-${String(seq).padStart(4, "0")}`,
    tanggal: input.tanggal,
    keterangan: input.keterangan,
    sumber: input.sumber,
    lines,
    status: "Diposting",
    reversalDari: input.reversalDari,
    dibuatOleh: input.aktor,
    dibuatPada: new Date().toISOString(),
  };
  db.journals.unshift(entry);
  return entry;
}

/** Cancels an entry by posting its mirror. Posted journals are never edited. */
export function reverseJournal(db: Database, journalId: ID, aktor: string, alasan: string) {
  const original = db.journals.find((j) => j.id === journalId);
  if (!original) throw new Error("Jurnal tidak ditemukan.");
  if (original.status === "Dibatalkan") throw new Error("Jurnal ini sudah dibalik.");

  const reversal = postJournal(db, {
    scope: { tenantId: original.tenantId, branchId: original.branchId },
    tanggal: new Date().toISOString().slice(0, 10),
    keterangan: `Pembalikan ${original.nomor} — ${alasan}`,
    sumber: original.sumber,
    lines: original.lines.map((l) => ({
      akunId: l.akunId,
      debit: l.kredit,
      kredit: l.debit,
      memo: l.memo,
    })),
    aktor,
    reversalDari: original.id,
  });
  original.status = "Dibatalkan";
  return reversal;
}

/* ── derived reads ─────────────────────────────────────────────────────── */

export interface AccountBalance {
  akun: AccountEntity;
  debit: number;
  kredit: number;
  /** Signed by the account's normal balance, so a positive figure reads right. */
  saldo: number;
}

/** Movement per account within a window; omit dates for all time. */
export function accountBalances(
  db: Database,
  range?: { from?: string; to?: string },
): AccountBalance[] {
  const totals = new Map<ID, { debit: number; kredit: number }>();

  for (const j of db.journals) {
    if (j.status !== "Diposting") continue;
    if (range?.from && j.tanggal < range.from) continue;
    if (range?.to && j.tanggal > range.to) continue;
    for (const l of j.lines) {
      const row = totals.get(l.akunId) ?? { debit: 0, kredit: 0 };
      row.debit += l.debit;
      row.kredit += l.kredit;
      totals.set(l.akunId, row);
    }
  }

  return db.accounts
    .filter((a) => !a.kode.endsWith("-0000"))
    .map((akun) => {
      const t = totals.get(akun.id) ?? { debit: 0, kredit: 0 };
      const saldo =
        akun.saldoNormal === "debit" ? t.debit - t.kredit : t.kredit - t.debit;
      return { akun, debit: round(t.debit), kredit: round(t.kredit), saldo: round(saldo) };
    });
}

export interface ProfitAndLoss {
  pendapatan: AccountBalance[];
  beban: AccountBalance[];
  totalPendapatan: number;
  totalBeban: number;
  labaKotor: number;
  labaBersih: number;
}

/** Income statement for a period, straight from the ledger. */
export function profitAndLoss(
  db: Database,
  range: { from: string; to: string },
): ProfitAndLoss {
  const balances = accountBalances(db, range);
  const pendapatan = balances.filter((b) => b.akun.tipe === "Pendapatan");
  const beban = balances.filter((b) => b.akun.tipe === "Beban");

  // Contra-revenue (returns) carries a debit normal balance, so summing the
  // signed figures nets it off revenue automatically.
  const totalPendapatan = round(
    pendapatan.reduce(
      (s, b) => s + (b.akun.saldoNormal === "kredit" ? b.saldo : -b.saldo),
      0,
    ),
  );
  const totalBeban = round(beban.reduce((s, b) => s + b.saldo, 0));
  const hpp = beban.find((b) => b.akun.role === "hpp")?.saldo ?? 0;

  return {
    pendapatan,
    beban,
    totalPendapatan,
    totalBeban,
    labaKotor: round(totalPendapatan - hpp),
    labaBersih: round(totalPendapatan - totalBeban),
  };
}

/** Debit and credit totals must agree; if they do not, something is wrong. */
export function trialBalance(db: Database, range?: { from?: string; to?: string }) {
  const rows = accountBalances(db, range).filter(
    (b) => b.debit !== 0 || b.kredit !== 0,
  );
  return {
    rows,
    totalDebit: round(rows.reduce((s, r) => s + r.debit, 0)),
    totalKredit: round(rows.reduce((s, r) => s + r.kredit, 0)),
  };
}
