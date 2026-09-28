// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, resetDb } from "@/mocks/db";
import { getActiveScope, setActiveScope } from "@/mocks/scope";
import type { PlanEntity, SAEntity } from "@/mocks/types";
import { saApiMock } from "./saApi.mock";

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

beforeEach(() => {
  localStorage.clear();
  resetDb();
});

/** One applied October source: 10 units on the 3rd, 7 on the 20th. */
function cutoverFixture({ totalQuota = 500, allocated = 0 } = {}) {
  const db = getDb();
  // Act as the branch's own tenant: the write half of a cutover belongs to
  // the acting tenant alone, exactly as on the backend.
  const branch = db.branches[0];
  setActiveScope({
    actingTenantId: branch.tenantId, visibleTenantIds: [branch.tenantId],
    branchId: branch.id, allowedBranchIds: [],
  });
  const scope = getActiveScope();
  branch.planningStartDate = undefined;
  const productId = db.products[0].id;
  const outlet = db.outlets[0];
  outlet.tenantId = scope.actingTenantId;
  outlet.branchId = branch.id;

  const agreement: SAEntity = {
    tenantId: scope.actingTenantId,
    branchId: branch.id,
    id: "sa-cutover",
    nomorSA: "SIM3LON-202610-BASE",
    supplier: "Pertamina",
    periodeMulai: "2026-10-01",
    periodeBerakhir: "2026-10-31",
    totalKuota: totalQuota,
    dialokasikan: allocated,
    terpakai: 0,
    status: "Aktif",
    diunggahOleh: "file_import",
    diunggahPada: "2026-10-01T00:00:00.000Z",
    productId,
    productName: db.products[0].nama,
  };
  db.scheduleAgreements.push(agreement);
  db.sim3lonSourceSnapshots.push({
    tenantId: scope.actingTenantId,
    branchId: branch.id,
    batchId: "batch-october",
    saId: agreement.id,
    productId,
    periodMonth: "2026-10",
    status: "applied",
    complete: true,
    createdAt: "2026-10-01T00:00:00.000Z",
    rows: [
      { date: "2026-10-03", outletId: outlet.id, qty: 10 },
      { date: "2026-10-20", outletId: outlet.id, qty: 7 },
    ],
  });
  return { agreementId: agreement.id, branchId: branch.id, outlet, productId };
}

const agreementOf = (id: string) => getDb().scheduleAgreements.find((row) => row.id === id)!;
const branchOf = (id: string) => getDb().branches.find((row) => row.id === id)!;

describe("mock planning cutover", () => {
  it("reports the opening balance on a dry run and writes nothing", async () => {
    const { agreementId, branchId } = cutoverFixture();

    const report = await saApiMock.setPlanningCutover("2026-10-10", true);

    expect(report.applied).toBe(false);
    expect(report.scopes).toHaveLength(1);
    expect(report.scopes[0]).toMatchObject({ openingBefore: 0, openingAfter: 10, allocatedAfter: 10, usedAfter: 10 });
    expect(agreementOf(agreementId).dialokasikan).toBe(0);
    expect(branchOf(branchId).planningStartDate).toBeUndefined();
  });

  it("folds the opening into allocated and used exactly once", async () => {
    const { agreementId, branchId } = cutoverFixture();

    await saApiMock.setPlanningCutover("2026-10-10", false);
    await saApiMock.setPlanningCutover("2026-10-10", false);

    const agreement = agreementOf(agreementId);
    expect(branchOf(branchId).planningStartDate).toBe("2026-10-10");
    expect(agreement.dialokasikan).toBe(10);
    expect(agreement.terpakai).toBe(10);
  });

  it("releases the opening when the date moves back to the month start", async () => {
    const { agreementId } = cutoverFixture();

    await saApiMock.setPlanningCutover("2026-10-25", false);
    expect(agreementOf(agreementId).dialokasikan).toBe(17);
    await saApiMock.setPlanningCutover("2026-10-01", false);

    expect(agreementOf(agreementId)).toMatchObject({ dialokasikan: 0, terpakai: 0 });
  });

  it("blocks a live plan dated before the cutover", async () => {
    const { agreementId, branchId } = cutoverFixture();
    const plan: PlanEntity = {
      tenantId: getActiveScope().actingTenantId, branchId, id: "plan-early", version: 1,
      kode: "RD-20261003-001", tanggal: "2026-10-03", saId: agreementId, status: "Terkonfirmasi",
      dibuatOleh: "Checker", dibuatPada: "2026-10-01T00:00:00.000Z",
    };
    getDb().plans.push(plan);

    const report = await saApiMock.setPlanningCutover("2026-10-10", true);
    expect(report.blockers.map((blocker) => blocker.code)).toContain("plan_before_cutover");
    await expect(saApiMock.setPlanningCutover("2026-10-10", false)).rejects.toMatchObject({ status: 409 });
    expect(branchOf(branchId).planningStartDate).toBeUndefined();
  });

  it("refuses an opening above the Base ceiling", async () => {
    cutoverFixture({ totalQuota: 100, allocated: 95 });

    const report = await saApiMock.setPlanningCutover("2026-10-10", true);

    expect(report.blockers.map((blocker) => blocker.code)).toContain("OPENING_EXCEEDS_QUOTA");
  });
});

describe("mock tenancy", () => {
  it("refuses a cutover on a branch the acting tenant only sees", async () => {
    const { branchId } = cutoverFixture();
    const owner = getDb().branches.find((row) => row.id === branchId)!.tenantId;
    const parent = getDb().tenants.find((row) => row.id === owner)?.indukId;
    setActiveScope({
      actingTenantId: parent ?? "tnt-other", visibleTenantIds: [parent ?? "tnt-other", owner],
      branchId, allowedBranchIds: [],
    });

    await expect(saApiMock.setPlanningCutover("2026-10-10", false)).rejects.toMatchObject({ status: 403 });
    expect(branchOf(branchId).planningStartDate).toBeUndefined();
  });
});

describe("mock SIM3LON variances", () => {
  it("reports a confirmed plan that differs from the source and leaves it alone", async () => {
    const { agreementId, branchId, outlet, productId } = cutoverFixture();
    await saApiMock.setPlanningCutover("2026-10-10", false);
    const db = getDb();
    db.plans.push({
      tenantId: getActiveScope().actingTenantId, branchId, id: "plan-twentieth", version: 1,
      kode: "RD-20261020-001", tanggal: "2026-10-20", saId: agreementId, status: "Terkonfirmasi",
      dibuatOleh: "Checker", dibuatPada: "2026-10-10T00:00:00.000Z",
    });
    db.planRows.push({
      id: "row-twentieth", planId: "plan-twentieth", outletId: outlet.id, driverId: null,
      lines: [{ productId, jumlah: 9 }], jumlahUnit: 9, jamPengiriman: "08:00",
    });

    const report = await saApiMock.getSIM3LONVariances(productId, "2026-10");

    const twentieth = report.rows.find((row) => row.date === "2026-10-20");
    expect(twentieth).toMatchObject({ sim3lonQty: 7, committedQty: 9, variance: -2, kind: "over" });
    expect(report.rows.some((row) => row.date < "2026-10-10")).toBe(false);
    expect(getDb().planRows.find((row) => row.id === "row-twentieth")?.jumlahUnit).toBe(9);
  });
});
