// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, resetDb } from "@/mocks/db";
import { setActiveScope } from "@/mocks/scope";
import { postJournal } from "@/mocks/ledger";
import { fiscalYearApiMock } from "./fiscalYearApi.mock";

/**
 * Mirrors fortius-backend's own internal/usecase/fiscalyear/services_test.go
 * -- same golden net-income figures, same sequencing rules (gap-closing
 * plan, Phase E).
 */

const stored = new Map<string, string>();
const memoryStorage: Storage = {
  get length() { return stored.size; },
  clear: () => stored.clear(),
  getItem: (key) => stored.get(key) ?? null,
  key: (index) => [...stored.keys()][index] ?? null,
  removeItem: (key) => { stored.delete(key); },
  setItem: (key, value) => { stored.set(key, value); },
};
Object.defineProperty(globalThis, "localStorage", { configurable: true, value: memoryStorage });

function postRevenueAndExpense(tanggal: string, revenue: number, expense: number): void {
  const db = getDb();
  const pendapatan = db.accounts.find((a) => a.role === "pendapatan")!;
  const hpp = db.accounts.find((a) => a.role === "hpp")!;
  const kas = db.accounts.find((a) => a.role === "kas")!;
  postJournal(db, {
    tanggal, keterangan: "fixture revenue", sumber: { tipe: "manual", id: "fx" }, aktor: "Tester",
    lines: [
      { akunId: kas.id, debit: revenue, kredit: 0 },
      { akunId: pendapatan.id, debit: 0, kredit: revenue },
    ],
  });
  postJournal(db, {
    tanggal, keterangan: "fixture expense", sumber: { tipe: "manual", id: "fx" }, aktor: "Tester",
    lines: [
      { akunId: hpp.id, debit: expense, kredit: 0 },
      { akunId: kas.id, debit: 0, kredit: expense },
    ],
  });
}

function labaDitahanBalance(): number {
  const db = getDb();
  const labaDitahan = db.accounts.find((a) => a.role === "labaDitahan")!;
  let debit = 0;
  let kredit = 0;
  for (const j of db.journals) {
    if (j.status !== "Diposting") continue;
    for (const l of j.lines) {
      if (l.akunId !== labaDitahan.id) continue;
      debit += l.debit;
      kredit += l.kredit;
    }
  }
  return kredit - debit;
}

beforeEach(() => {
  localStorage.clear();
  resetDb();
  const db = getDb();
  setActiveScope({
    actingTenantId: db.branches[0].tenantId, visibleTenantIds: [db.branches[0].tenantId],
    branchId: db.branches[0].id, allowedBranchIds: [],
  });
  // Isolate from whatever the seed itself already posted.
  db.journals.length = 0;
  db.fiscalYears.length = 0;
});

it("plugs a profitable year's net income to Laba Ditahan as a credit", async () => {
  postRevenueAndExpense("2098-06-15", 1_000_000, 600_000);

  await fiscalYearApiMock.closeFiscalYear(2098);

  expect(labaDitahanBalance()).toBe(400_000);
});

it("plugs a loss-making year's net income to Laba Ditahan as a debit", async () => {
  postRevenueAndExpense("2098-06-15", 500_000, 800_000);

  await fiscalYearApiMock.closeFiscalYear(2098);

  expect(labaDitahanBalance()).toBe(-300_000);
});

it("reopening posts the exact mirror, netting Laba Ditahan back to zero", async () => {
  postRevenueAndExpense("2098-06-15", 1_000_000, 600_000);
  const closed = await fiscalYearApiMock.closeFiscalYear(2098);

  await fiscalYearApiMock.reopenFiscalYear(2098, closed.version);

  expect(labaDitahanBalance()).toBe(0);
});

it("refuses to close an already-closed year", async () => {
  postRevenueAndExpense("2098-06-15", 1_000_000, 600_000);
  await fiscalYearApiMock.closeFiscalYear(2098);

  await expect(fiscalYearApiMock.closeFiscalYear(2098)).rejects.toMatchObject({ status: 409 });
});

it("refuses to close a year while an earlier one with activity is still open", async () => {
  postRevenueAndExpense("2097-03-01", 200_000, 100_000);
  postRevenueAndExpense("2098-06-15", 1_000_000, 600_000);

  await expect(fiscalYearApiMock.closeFiscalYear(2098)).rejects.toMatchObject({ status: 409 });
});

it("refuses to reopen a year while a later one is still closed", async () => {
  postRevenueAndExpense("2098-06-15", 1_000_000, 600_000);
  const first = await fiscalYearApiMock.closeFiscalYear(2098);
  postRevenueAndExpense("2099-03-01", 500_000, 100_000);
  await fiscalYearApiMock.closeFiscalYear(2099);

  await expect(fiscalYearApiMock.reopenFiscalYear(2098, first.version)).rejects.toMatchObject({ status: 409 });
});

it("refuses to reopen a year that is not closed", async () => {
  await expect(fiscalYearApiMock.reopenFiscalYear(2098, 1)).rejects.toMatchObject({ status: 404 });
});

// Caught live: a year with posted activity but no revenue/expense
// movement (e.g. every journal that year only touched balance-sheet
// accounts) produces zero closing lines, which postJournal's own "at
// least two lines" guard refuses -- the same limitation the real
// backend's own ledger.Post carries, so this is not something to work
// around. What IS a bug: closeFiscalYear used to create the fiscal-year
// row before calling postJournal, so a year nobody had ever closed before
// was left with a phantom "open" row in memory after this exact failure
// (mutate has no rollback) -- a second attempt would then see an
// existing row instead of treating the year as untouched.
it("leaves no row behind when a year has activity but nothing to close", async () => {
  const db = getDb();
  // A journal that posts only to balance-sheet accounts -- no
  // Pendapatan/Beban line for closingLines to find.
  const kas = db.accounts.find((a) => a.role === "kas")!;
  const piutang = db.accounts.find((a) => a.role === "piutang")!;
  postJournal(db, {
    tanggal: "2098-03-01", keterangan: "fixture transfer", sumber: { tipe: "manual", id: "fx" }, aktor: "Tester",
    lines: [{ akunId: kas.id, debit: 500_000, kredit: 0 }, { akunId: piutang.id, debit: 0, kredit: 500_000 }],
  });

  await expect(fiscalYearApiMock.closeFiscalYear(2098)).rejects.toThrow();

  expect(db.fiscalYears.find((f) => f.year === 2098)).toBeUndefined();
});
