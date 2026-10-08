// @vitest-environment jsdom
import { beforeEach, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, resetDb } from "@/mocks/db";
import { setActiveScope } from "@/mocks/scope";
import type { AssetEntity } from "@/mocks/types";
import { depreciationRunApiMock } from "./depreciationRunApi.mock";

/**
 * Mirrors fortius-backend's own internal/usecase/depreciationrun/
 * services_test.go -- same fixtures, same golden numbers, proving this
 * mock's CreateRun/VoidRun agree with the real usecase's sequencing,
 * idempotency and straight-line rounding rules (gap-closing plan, Phase
 * D). Exercised against a real seeded Database/scope, the same reasoning
 * saApi.cutover.mock.test.ts gives for testing a mock's own logic where
 * it runs.
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

function buildingAsset(id: string, cost: number, residual: number, lifeMonths: number, start: string): AssetEntity {
  const db = getDb();
  const scope = { tenantId: db.branches[0].tenantId, branchId: db.branches[0].id };
  return {
    ...scope,
    id, assetCode: id.toUpperCase(), name: "Gedung Kantor", assetClass: "building",
    acquisitionDate: start, depreciationStartDate: start,
    cost, residualValue: residual, usefulLifeMonths: lifeMonths, method: "straight_line",
    openingAccumulated: 0,
    assetAccountId: db.accounts.find((a) => a.kode === "1-2100")!.id,
    accumulatedAccountId: db.accounts.find((a) => a.kode === "1-2900")!.id,
    expenseAccountId: db.accounts.find((a) => a.kode === "5-5100")!.id,
    status: "active", version: 1, createdAt: start, updatedAt: start,
  };
}

function prepaidAsset(id: string, cost: number, lifeMonths: number, start: string): AssetEntity {
  const db = getDb();
  const scope = { tenantId: db.branches[0].tenantId, branchId: db.branches[0].id };
  return {
    ...scope,
    id, assetCode: id.toUpperCase(), name: "Sewa Tanah", assetClass: "prepaid",
    acquisitionDate: start, depreciationStartDate: start,
    cost, residualValue: 0, usefulLifeMonths: lifeMonths, method: "straight_line",
    openingAccumulated: 0,
    assetAccountId: db.accounts.find((a) => a.kode === "1-1500")!.id,
    accumulatedAccountId: undefined,
    expenseAccountId: db.accounts.find((a) => a.kode === "5-5500")!.id,
    status: "active", version: 1, createdAt: start, updatedAt: start,
  };
}

beforeEach(() => {
  localStorage.clear();
  resetDb();
  const db = getDb();
  setActiveScope({
    actingTenantId: db.branches[0].tenantId, visibleTenantIds: [db.branches[0].tenantId],
    branchId: db.branches[0].id, allowedBranchIds: [],
  });
  // Isolate from the seed's own demo assets (ast-001..003) -- this file's
  // fixtures are the only ones that should charge in these tests.
  db.assets.length = 0;
  db.depreciationRuns.length = 0;
});

// Mirrors TestStraightLineLastMonthAbsorbsRounding: 10 over 3 months is
// 3.33 rounded to 3/month, so month 3 must charge 4, or accumulated would
// fall short of 10.
it("has the last month absorb the rounding across three consecutive runs", async () => {
  const db = getDb();
  db.assets.push(buildingAsset("bld-1", 10, 0, 3, "2026-01-01"));

  const want = [3, 3, 4];
  for (const [i, period] of ["2026-01", "2026-02", "2026-03"].entries()) {
    const run = await depreciationRunApiMock.createRun(period);
    expect(run.lines).toHaveLength(1);
    expect(run.lines[0].amount).toBe(want[i]);
  }

  const asset = db.assets.find((a) => a.id === "bld-1")!;
  const posted = db.depreciationRuns.flatMap((r) => r.lines).reduce((s, l) => s + l.amount, 0);
  expect(asset.openingAccumulated + posted).toBe(10);
});

it("refuses to re-post the same period", async () => {
  getDb().assets.push(buildingAsset("bld-1", 1_200_000, 0, 12, "2026-01-01"));
  await depreciationRunApiMock.createRun("2026-01");
  await expect(depreciationRunApiMock.createRun("2026-01")).rejects.toMatchObject({ status: 409 });
});

it("refuses a period earlier than the latest posted run", async () => {
  getDb().assets.push(buildingAsset("bld-1", 1_200_000, 0, 12, "2026-01-01"));
  await depreciationRunApiMock.createRun("2026-03");
  await expect(depreciationRunApiMock.createRun("2026-02")).rejects.toMatchObject({ status: 409 });
});

it("credits a prepaid asset's own account directly, with no accumulated account", async () => {
  const db = getDb();
  db.assets.push(prepaidAsset("pre-1", 12_000_000, 12, "2026-01-01"));
  const assetAccountId = db.assets[0].assetAccountId;

  await depreciationRunApiMock.createRun("2026-01");

  const journal = db.journals[0];
  const credited = journal.lines.find((l) => l.kredit > 0)!;
  expect(credited.akunId).toBe(assetAccountId);
});

// Mirrors TestFullyDepreciatedAssetStopsCharging: a long-lived asset
// (12 months) marked fully_depreciated is excluded by the active-status
// filter, not merely by periodIndex falling outside range -- period 2 of
// a 12-month life would otherwise still charge something.
it("excludes a fully_depreciated asset even mid-schedule", async () => {
  const db = getDb();
  const asset = buildingAsset("bld-1", 1_200_000, 0, 12, "2026-01-01");
  asset.status = "fully_depreciated";
  db.assets.push(asset);

  await expect(depreciationRunApiMock.createRun("2026-02")).rejects.toMatchObject({ status: 409 });
});

it("marks an asset fully_depreciated on its last period, and void reactivates it", async () => {
  const db = getDb();
  db.assets.push(buildingAsset("bld-1", 10, 0, 2, "2026-01-01"));
  await depreciationRunApiMock.createRun("2026-01");
  const second = await depreciationRunApiMock.createRun("2026-02");

  expect(db.assets.find((a) => a.id === "bld-1")!.status).toBe("fully_depreciated");

  await depreciationRunApiMock.voidRun(second.id, second.version);
  expect(db.assets.find((a) => a.id === "bld-1")!.status).toBe("active");
});

// Mirrors TestVoidOnlyLatestRun.
it("refuses to void a run that is not the latest posted one", async () => {
  getDb().assets.push(buildingAsset("bld-1", 2_400_000, 0, 24, "2026-01-01"));
  const first = await depreciationRunApiMock.createRun("2026-01");
  await depreciationRunApiMock.createRun("2026-02");

  await expect(depreciationRunApiMock.voidRun(first.id, first.version)).rejects.toMatchObject({ status: 409 });
});
