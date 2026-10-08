/**
 * Fiscal-year close/reopen, against the mock database.
 *
 * Mirrors the real usecase's own loadClosingBalances/closingLines: sums
 * every revenue/expense account's movement within the calendar year,
 * excluding any prior closing journal (the window's own closing entry on a
 * reopen's recompute would otherwise double back on itself), zeroes each
 * one, and plugs the difference -- net income -- to Laba Ditahan.
 */
import { ApiError, currentActor, latency, mutate } from "@/mocks/db";
import { postJournal } from "@/mocks/ledger";
import { scopedDb, stampScope } from "@/mocks/scope";
import type { AccountEntity, FiscalYearEntity, JournalLine } from "@/types/domain";
import type { FiscalYearApi, FiscalYearView } from "./contract";

function toView(row: FiscalYearEntity): FiscalYearView {
  return { year: row.year, status: row.status, closedAt: row.closedAt, version: row.version, createdAt: row.createdAt, updatedAt: row.updatedAt };
}

interface ClosingBalance {
  account: AccountEntity;
  natural: number;
}

/** Every Pendapatan/Beban account's own movement within [from, to],
 *  signed so a positive value always means "has a balance to zero out" --
 *  credit-minus-debit for revenue, debit-minus-credit for expense. */
function loadClosingBalances(db: ReturnType<typeof scopedDb>, from: string, to: string): ClosingBalance[] {
  const totals = new Map<string, { debit: number; kredit: number }>();
  for (const j of db.journals) {
    if (j.status !== "Diposting") continue;
    if (j.sumber.tipe === "closing") continue;
    if (j.tanggal < from || j.tanggal > to) continue;
    for (const l of j.lines) {
      const t = totals.get(l.akunId) ?? { debit: 0, kredit: 0 };
      t.debit += l.debit;
      t.kredit += l.kredit;
      totals.set(l.akunId, t);
    }
  }
  const balances: ClosingBalance[] = [];
  for (const account of db.accounts) {
    if (account.tipe !== "Pendapatan" && account.tipe !== "Beban") continue;
    const t = totals.get(account.id);
    if (!t || (t.debit === 0 && t.kredit === 0)) continue;
    const natural = account.tipe === "Pendapatan" ? t.kredit - t.debit : t.debit - t.kredit;
    if (natural === 0) continue;
    balances.push({ account, natural });
  }
  return balances;
}

/** Zeroes every account's own balance and plugs the net to Laba Ditahan --
 *  mirrors the real backend's own closingLines. */
function closingLines(db: ReturnType<typeof scopedDb>, balances: ClosingBalance[]): { lines: JournalLine[]; netIncome: number } {
  const labaDitahan = db.accounts.find((a) => a.role === "labaDitahan");
  if (!labaDitahan) throw new ApiError("Akun Laba Ditahan tidak ada di bagan akun.", 500);

  const lines: JournalLine[] = [];
  let netIncome = 0;
  for (const { account, natural } of [...balances].sort((a, b) => a.account.id.localeCompare(b.account.id))) {
    netIncome += account.tipe === "Pendapatan" ? natural : -natural;
    const zeroingIsDebit = account.tipe === "Pendapatan" ? natural > 0 : natural < 0;
    lines.push(
      zeroingIsDebit
        ? { akunId: account.id, debit: Math.abs(natural), kredit: 0 }
        : { akunId: account.id, debit: 0, kredit: Math.abs(natural) },
    );
  }
  if (netIncome > 0) lines.push({ akunId: labaDitahan.id, debit: 0, kredit: netIncome });
  else if (netIncome < 0) lines.push({ akunId: labaDitahan.id, debit: -netIncome, kredit: 0 });
  return { lines, netIncome };
}

function mirrorLines(lines: JournalLine[]): JournalLine[] {
  return lines.map((l) => ({ akunId: l.akunId, debit: l.kredit, kredit: l.debit, memo: l.memo }));
}

async function listFiscalYears(): Promise<FiscalYearView[]> {
  await latency("read");
  return [...scopedDb().fiscalYears].sort((a, b) => b.year - a.year).map(toView);
}

async function closeFiscalYear(year: number): Promise<FiscalYearView> {
  await latency("write");
  return mutate((db) => {
    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    let row = db.fiscalYears.find((f) => f.year === year);
    if (row?.status === "closed") throw new ApiError("Tahun buku ini sudah ditutup.", 409);

    const closedYears = new Set(db.fiscalYears.filter((f) => f.status === "closed").map((f) => f.year));
    const activityYears = new Set(
      db.journals
        .filter((j) => j.status === "Diposting" && j.tanggal < from)
        .map((j) => Number(j.tanggal.slice(0, 4))),
    );
    for (const activityYear of activityYears) {
      if (!closedYears.has(activityYear)) {
        throw new ApiError("Tahun buku sebelumnya yang memiliki aktivitas harus ditutup lebih dahulu.", 409);
      }
    }

    const balances = loadClosingBalances(db, from, to);
    const { lines } = closingLines(db, balances);

    // Resolve the posting scope before writing anything -- a fresh year's
    // scope borrows the active branch the same way stampScope's own
    // default does, since there is no existing row yet to read it from.
    const scope = row ? { tenantId: row.tenantId, branchId: row.branchId } : stampScope({});

    // postJournal runs (and may throw -- e.g. a year with activity but no
    // revenue/expense movement produces zero lines, which the real
    // backend's own ledger.Post also refuses) before the fiscal-year row
    // is created or mutated: `mutate` has no rollback, so creating the
    // row first would leave an unpersisted "open" row sitting in memory
    // after a failed close, visible until the next successful write or a
    // fresh load.
    const journal = postJournal(db, {
      scope,
      tanggal: to,
      keterangan: `Closing entry FY${year}`,
      sumber: { tipe: "closing", id: year.toString() },
      aktor: currentActor(),
      lines,
    });

    const now = new Date().toISOString();
    if (!row) {
      row = { ...scope, year, status: "open" as const, version: 1, createdAt: now, updatedAt: now };
      db.fiscalYears.push(row);
    }

    row.status = "closed";
    row.closedAt = now;
    row.closingJournalId = journal.id;
    row.version += 1;
    row.updatedAt = now;
    return toView(row);
  });
}

async function reopenFiscalYear(year: number, version: number): Promise<FiscalYearView> {
  await latency("write");
  return mutate((db) => {
    const row = db.fiscalYears.find((f) => f.year === year);
    if (!row) throw new ApiError("Tahun buku tidak ditemukan.", 404);
    if (row.status !== "closed") throw new ApiError("Hanya tahun buku yang sudah ditutup dapat dibuka kembali.", 409);

    const hasLater = db.fiscalYears.some((f) => f.year > year && f.status === "closed");
    if (hasLater) throw new ApiError("Tahun buku setelahnya masih tertutup -- buka tahun itu lebih dahulu.", 409);

    if (row.version !== version) {
      throw new ApiError("Tahun buku sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }

    const from = `${year}-01-01`;
    const to = `${year}-12-31`;
    const balances = loadClosingBalances(db, from, to);
    const { lines } = closingLines(db, balances);

    postJournal(db, {
      scope: { tenantId: row.tenantId, branchId: row.branchId },
      tanggal: to,
      keterangan: `Reopen of FY${year} closing entry`,
      sumber: { tipe: "closing", id: row.year.toString() },
      aktor: currentActor(),
      lines: mirrorLines(lines),
    });

    const now = new Date().toISOString();
    row.status = "open";
    row.closedAt = undefined;
    row.closingJournalId = undefined;
    row.version += 1;
    row.updatedAt = now;
    return toView(row);
  });
}

export const fiscalYearApiMock: FiscalYearApi = {
  listFiscalYears,
  closeFiscalYear,
  reopenFiscalYear,
};
