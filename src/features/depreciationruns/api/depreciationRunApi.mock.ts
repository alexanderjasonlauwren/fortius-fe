/**
 * Monthly depreciation runs, against the mock database.
 *
 * Posts through the same postJournal/reverseJournal mocks/ledger.ts every
 * other write-path feature uses. No draft state: CreateRun computes the
 * lines and writes the one balanced journal in the same call, mirroring
 * the real backend's own services.go header for why.
 */
import { chargeFor, periodIndex } from "../lib/depreciation";
import { ApiError, currentActor, latency, mutate, nextId } from "@/mocks/db";
import { postJournal } from "@/mocks/ledger";
import { scopedDb, stampScope } from "@/mocks/scope";
import type { AssetEntity, DepreciationRunEntity, JournalLine } from "@/types/domain";
import type { DepreciationRunApi, DepreciationRunView } from "./contract";

function toView(db: ReturnType<typeof scopedDb>, row: DepreciationRunEntity): DepreciationRunView {
  let total = 0;
  const lines = row.lines.map((l) => {
    const asset = db.assets.find((a) => a.id === l.assetId);
    total += l.amount;
    return { assetId: l.assetId, assetCode: asset?.assetCode ?? "", assetName: asset?.name ?? "", amount: l.amount };
  });
  return { id: row.id, period: row.period, status: row.status, totalAmount: total, lines, version: row.version, createdAt: row.createdAt };
}

/** The last calendar day of a "YYYY-MM" period, as "YYYY-MM-DD" -- a run's
 *  journal is always dated at period end, mirroring the real backend's own
 *  `period.AddDate(0, 1, -1)`. */
function periodEndDate(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** One asset's own debit/credit account pair for a depreciation charge:
 *  Dr the expense account, Cr the accumulated account, or the asset
 *  account itself when the class has none (prepaid). */
function creditAccountFor(asset: AssetEntity): string {
  return asset.accumulatedAccountId ?? asset.assetAccountId;
}

/** Sums each side's postings by account so the journal carries one line
 *  per distinct account rather than one per asset -- mirrors the real
 *  backend's own groupedLedgerLines. */
function groupedLines(debits: Map<string, number>, credits: Map<string, number>): JournalLine[] {
  const lines: JournalLine[] = [];
  for (const [akunId, debit] of [...debits.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push({ akunId, debit, kredit: 0 });
  }
  for (const [akunId, kredit] of [...credits.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    lines.push({ akunId, debit: 0, kredit });
  }
  return lines;
}

async function listRuns(): Promise<DepreciationRunView[]> {
  await latency("read");
  const db = scopedDb();
  return [...db.depreciationRuns].sort((a, b) => b.period.localeCompare(a.period)).map((row) => toView(db, row));
}

async function getRun(id: string): Promise<DepreciationRunView> {
  await latency("read");
  const db = scopedDb();
  const row = db.depreciationRuns.find((r) => r.id === id);
  if (!row) throw new ApiError("Run penyusutan tidak ditemukan.", 404);
  return toView(db, row);
}

async function createRun(period: string): Promise<DepreciationRunView> {
  await latency("write");
  if (!/^\d{4}-\d{2}$/.test(period)) throw new ApiError("Periode tidak valid.", 422);

  return mutate((db) => {
    const latest = [...db.depreciationRuns]
      .filter((r) => r.status === "posted")
      .sort((a, b) => b.period.localeCompare(a.period))[0];
    if (latest && period <= latest.period) {
      throw new ApiError("Run untuk periode ini, atau yang lebih baru, sudah diposting.", 409);
    }

    const debitByAccount = new Map<string, number>();
    const creditByAccount = new Map<string, number>();
    const lines: { assetId: string; amount: number }[] = [];
    const fullyDepreciated: AssetEntity[] = [];

    for (const asset of db.assets.filter((a) => a.status === "active")) {
      const index = periodIndex(asset.depreciationStartDate, period);
      const amount = chargeFor(asset.cost, asset.residualValue, asset.usefulLifeMonths, index);
      if (amount <= 0) continue;

      debitByAccount.set(asset.expenseAccountId, (debitByAccount.get(asset.expenseAccountId) ?? 0) + amount);
      const creditAccount = creditAccountFor(asset);
      creditByAccount.set(creditAccount, (creditByAccount.get(creditAccount) ?? 0) + amount);
      lines.push({ assetId: asset.id, amount });

      if (index >= asset.usefulLifeMonths) fullyDepreciated.push(asset);
    }
    if (lines.length === 0) {
      throw new ApiError("Tidak ada aset yang perlu disusutkan untuk periode ini.", 409);
    }

    const now = new Date().toISOString();
    const row: DepreciationRunEntity = stampScope({
      id: nextId("deprun"),
      period,
      status: "posted",
      lines,
      version: 1,
      createdAt: now,
    });

    const journal = postJournal(db, {
      scope: { tenantId: row.tenantId, branchId: row.branchId },
      tanggal: periodEndDate(period),
      keterangan: `Depreciation run ${period}`,
      sumber: { tipe: "depreciation", id: row.id },
      aktor: currentActor(),
      lines: groupedLines(debitByAccount, creditByAccount),
    });
    row.journalId = journal.id;

    for (const asset of fullyDepreciated) {
      asset.status = "fully_depreciated";
      asset.version += 1;
      asset.updatedAt = now;
    }

    db.depreciationRuns.unshift(row);
    return toView(db, row);
  });
}

async function voidRun(id: string, version: number): Promise<DepreciationRunView> {
  await latency("write");
  return mutate((db) => {
    const row = db.depreciationRuns.find((r) => r.id === id);
    if (!row) throw new ApiError("Run penyusutan tidak ditemukan.", 404);
    if (row.status !== "posted") throw new ApiError("Hanya run yang sudah diposting dapat dibatalkan.", 409);

    const latest = [...db.depreciationRuns]
      .filter((r) => r.status === "posted")
      .sort((a, b) => b.period.localeCompare(a.period))[0];
    if (!latest || latest.id !== row.id) {
      throw new ApiError("Hanya run terbaru yang sudah diposting yang dapat dibatalkan.", 409);
    }
    if (row.version !== version) {
      throw new ApiError("Run sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }

    const debitByAccount = new Map<string, number>();
    const creditByAccount = new Map<string, number>();
    const now = new Date().toISOString();
    for (const line of row.lines) {
      const asset = db.assets.find((a) => a.id === line.assetId);
      if (!asset) continue;
      // The mirror: credit the expense account back, debit the
      // accumulated/asset account -- the opposite of CreateRun's own
      // debitByAccount/creditByAccount above.
      creditByAccount.set(asset.expenseAccountId, (creditByAccount.get(asset.expenseAccountId) ?? 0) + line.amount);
      const debitAccount = creditAccountFor(asset);
      debitByAccount.set(debitAccount, (debitByAccount.get(debitAccount) ?? 0) + line.amount);

      if (asset.status === "fully_depreciated") {
        asset.status = "active";
        asset.version += 1;
        asset.updatedAt = now;
      }
    }

    postJournal(db, {
      scope: { tenantId: row.tenantId, branchId: row.branchId },
      tanggal: periodEndDate(row.period),
      keterangan: `Void of depreciation run ${row.period}`,
      sumber: { tipe: "depreciation", id: row.id },
      aktor: currentActor(),
      lines: groupedLines(debitByAccount, creditByAccount),
    });

    row.status = "void";
    row.version += 1;
    return toView(db, row);
  });
}


export const depreciationRunApiMock: DepreciationRunApi = {
  listRuns,
  getRun,
  createRun,
  voidRun,
};
