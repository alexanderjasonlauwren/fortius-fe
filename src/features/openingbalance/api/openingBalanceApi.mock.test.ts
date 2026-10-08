// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, resetDb } from "@/mocks/db";
import { setActiveScope } from "@/mocks/scope";
import { openingBalanceApiMock } from "./openingBalanceApi.mock";

/** Proves the mock's one real piece of state -- the one-time commit guard
 *  mirroring the real backend's own "An opening balance already exists"
 *  refusal -- works, since the mock otherwise cannot validate an uploaded
 *  workbook's content at all (gap-closing plan, Phase E; see this file's
 *  own header for the full scope decision). */

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

const FILE = new File(["x"], "saldo-awal.xlsx");

beforeEach(() => {
  localStorage.clear();
  resetDb();
  const db = getDb();
  setActiveScope({
    actingTenantId: db.branches[0].tenantId, visibleTenantIds: [db.branches[0].tenantId],
    branchId: db.branches[0].id, allowedBranchIds: [],
  });
});

it("commits a balanced journal and records that one was committed", async () => {
  const before = getDb().journals.length;

  const result = await openingBalanceApiMock.commitOpeningBalance("2026-01-01", FILE);

  expect(result.journalId).toBeTruthy();
  expect(getDb().journals.length).toBe(before + 1);
  expect(getDb().openingBalances).toHaveLength(1);
});

it("refuses a second commit", async () => {
  await openingBalanceApiMock.commitOpeningBalance("2026-01-01", FILE);

  await expect(openingBalanceApiMock.commitOpeningBalance("2026-01-01", FILE)).rejects.toMatchObject({ status: 409 });
});
