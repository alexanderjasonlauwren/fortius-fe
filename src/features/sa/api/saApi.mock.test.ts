// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { distributionApiMock } from "@/features/distribution/api/distributionApi.mock";
import { getDb, resetDb } from "@/mocks/db";
import { getActiveScope } from "@/mocks/scope";
import type { PlanEntity, PlanRowEntity, SAEntity } from "@/mocks/types";
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

function reconciliationFixture({ oldQty = 100, newQty = 80, totalQuota = 500, assigned = false } = {}) {
  const db = getDb();
  const scope = getActiveScope();
  const branchId = scope.branchId ?? scope.allowedBranchIds[0] ?? db.branches[0].id;
  const productId = db.products[0].id;
  const outlet = db.outlets[0];
  outlet.tenantId = scope.actingTenantId;
  outlet.branchId = branchId;
  outlet.blokirOtomatis = false;

  const agreement: SAEntity = {
    tenantId: scope.actingTenantId,
    branchId,
    id: "sa-reconciliation",
    nomorSA: "SIM3LON-202610-BASE",
    supplier: "Pertamina",
    periodeMulai: "2026-10-01",
    periodeBerakhir: "2026-10-31",
    totalKuota: totalQuota,
    dialokasikan: 20 + oldQty,
    terpakai: 20,
    status: "Aktif",
    diunggahOleh: "file_import",
    diunggahPada: "2026-10-01T00:00:00.000Z",
    productId,
    productName: db.products[0].nama,
  };
  const plan: PlanEntity = {
    tenantId: scope.actingTenantId,
    branchId,
    id: "plan-reconciliation",
    version: 4,
    kode: "RD-20261003-001",
    tanggal: "2026-10-03",
    saId: agreement.id,
    status: "Draft",
    dibuatOleh: "Checker",
    dibuatPada: "2026-10-01T01:00:00.000Z",
  };
  const planRow: PlanRowEntity = {
    id: "row-reconciliation",
    planId: plan.id,
    outletId: outlet.id,
    driverId: assigned ? "driver-reconciliation" : null,
    vehicleId: assigned ? "vehicle-reconciliation" : null,
    lines: [{ productId, jumlah: oldQty }],
    jumlahUnit: oldQty,
    jamPengiriman: "08:30",
    tripNo: assigned ? 2 : null,
  };

  db.scheduleAgreements.push(agreement);
  db.plans.push(plan);
  db.planRows.push(planRow);
  db.sim3lonSourceSnapshots.push(
    {
      tenantId: scope.actingTenantId,
      branchId,
      batchId: "batch-predecessor",
      saId: agreement.id,
      productId,
      periodMonth: "2026-10",
      status: "applied",
      complete: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      rows: [{ date: plan.tanggal, outletId: outlet.id, qty: oldQty }],
    },
    {
      tenantId: scope.actingTenantId,
      branchId,
      batchId: "batch-candidate",
      saId: agreement.id,
      productId,
      periodMonth: "2026-10",
      status: "parsed",
      complete: true,
      createdAt: "2026-10-02T00:00:00.000Z",
      rows: [{ date: plan.tanggal, outletId: outlet.id, qty: newQty }],
    },
  );
  db.sim3lonPlanSources.push({
    tenantId: scope.actingTenantId,
    branchId,
    planId: plan.id,
    batchId: "batch-predecessor",
    productId,
    operationalDate: plan.tanggal,
  });

  return { agreement, db, outlet, plan, planRow };
}

describe("mock SIM3LON reconciliation", () => {
  it("returns the immutable three-way quantities and expected plan version", async () => {
    const { outlet, plan } = reconciliationFixture();

    const preview = await saApiMock.getSIM3LONReconciliation("batch-candidate");

    expect(preview).toMatchObject({
      candidateBatchId: "batch-candidate",
      expectedPredecessorBatchId: "batch-predecessor",
      reviewReady: true,
      expectedPlanVersions: [{ planId: plan.id, version: 4, status: "Draft" }],
      blockers: [],
    });
    expect(preview.changes).toContainEqual(expect.objectContaining({
      planId: plan.id,
      outletId: outlet.id,
      baselineQty: 100,
      currentQty: 100,
      proposedQty: 80,
      classification: "decrease",
      crewAssignmentAffected: false,
    }));
  });

  it("applies accepted draft quantities atomically and preserves row metadata", async () => {
    const { agreement, db, plan, planRow } = reconciliationFixture();
    const preview = await saApiMock.getSIM3LONReconciliation("batch-candidate");

    await saApiMock.applySIM3LON("batch-candidate", {
      expectedPredecessorBatchId: preview.expectedPredecessorBatchId,
      acceptedPlans: [{ planId: plan.id, expectedVersion: plan.version }],
    });

    const reconciled = db.planRows.find((row) => row.planId === plan.id)!;
    expect(reconciled).toMatchObject({
      id: planRow.id,
      driverId: planRow.driverId,
      vehicleId: planRow.vehicleId,
      jamPengiriman: planRow.jamPengiriman,
      tripNo: planRow.tripNo,
      jumlahUnit: 80,
      lines: [{ productId: planRow.lines[0].productId, jumlah: 80 }],
    });
    expect(plan.version).toBe(5);
    expect(agreement.dialokasikan).toBe(100);
    expect(db.sim3lonPlanSources.find((source) => source.planId === plan.id)?.batchId)
      .toBe("batch-candidate");
    expect(db.sim3lonSourceSnapshots.find((source) => source.batchId === "batch-candidate")?.status)
      .toBe("applied");
  });

  it("blocks an assigned changed draft and exact confirmation cannot bypass replanning", async () => {
    const { agreement, db, plan, planRow } = reconciliationFixture({ assigned: true });
    const preview = await saApiMock.getSIM3LONReconciliation("batch-candidate");
    const before = {
      qty: planRow.jumlahUnit,
      version: plan.version,
      allocated: agreement.dialokasikan,
      source: db.sim3lonPlanSources.find((source) => source.planId === plan.id)?.batchId,
      candidate: db.sim3lonSourceSnapshots.find((source) => source.batchId === "batch-candidate")?.status,
    };

    expect(preview.reviewReady).toBe(false);
    expect(preview.blockers).toContainEqual(expect.objectContaining({
      code: "assignment_replan_required",
      planId: plan.id,
    }));
    await expect(saApiMock.applySIM3LON("batch-candidate", {
      expectedPredecessorBatchId: preview.expectedPredecessorBatchId,
      acceptedPlans: [{ planId: plan.id, expectedVersion: plan.version }],
    })).rejects.toMatchObject({ status: 409 });
    expect({
      qty: planRow.jumlahUnit,
      version: plan.version,
      allocated: agreement.dialokasikan,
      source: db.sim3lonPlanSources.find((source) => source.planId === plan.id)?.batchId,
      candidate: db.sim3lonSourceSnapshots.find((source) => source.batchId === "batch-candidate")?.status,
    }).toEqual(before);
  });

  it("rejects a stale accepted version without changing plan, quota, source, or candidate", async () => {
    const { agreement, db, plan, planRow } = reconciliationFixture();
    const preview = await saApiMock.getSIM3LONReconciliation("batch-candidate");
    plan.version += 1;

    await expect(saApiMock.applySIM3LON("batch-candidate", {
      expectedPredecessorBatchId: preview.expectedPredecessorBatchId,
      acceptedPlans: [{ planId: plan.id, expectedVersion: 4 }],
    })).rejects.toMatchObject({ status: 409, code: "STALE_VERSION" });

    expect(db.planRows.find((row) => row.id === planRow.id)?.jumlahUnit).toBe(100);
    expect(agreement.dialokasikan).toBe(120);
    expect(db.sim3lonPlanSources.find((source) => source.planId === plan.id)?.batchId)
      .toBe("batch-predecessor");
    expect(db.sim3lonSourceSnapshots.find((source) => source.batchId === "batch-candidate")?.status)
      .toBe("parsed");
  });

  it("replays an applied candidate without incrementing versions or reserving quota twice", async () => {
    const { agreement, plan } = reconciliationFixture();
    const review = {
      expectedPredecessorBatchId: "batch-predecessor",
      acceptedPlans: [{ planId: plan.id, expectedVersion: plan.version }],
    };
    const first = await saApiMock.applySIM3LON("batch-candidate", review);
    const appliedVersion = plan.version;
    const appliedAllocation = agreement.dialokasikan;

    const replay = await saApiMock.applySIM3LON("batch-candidate", review);

    expect(replay).toEqual(first);
    expect(plan.version).toBe(appliedVersion);
    expect(agreement.dialokasikan).toBe(appliedAllocation);
  });

  it("moves a confirmed draft reservation to used quota exactly once", async () => {
    const { agreement, plan } = reconciliationFixture();
    await saApiMock.applySIM3LON("batch-candidate", {
      expectedPredecessorBatchId: "batch-predecessor",
      acceptedPlans: [{ planId: plan.id, expectedVersion: plan.version }],
    });
    const row = getDb().planRows.find((item) => item.planId === plan.id)!;
    row.driverId = "driver-reconciliation";
    row.vehicleId = "vehicle-reconciliation";
    row.tripNo = 1;

    await distributionApiMock.confirmPlan(plan.id, plan.version);

    expect(plan.status).toBe("Terkonfirmasi");
    expect(agreement.terpakai).toBe(100);
    expect(agreement.dialokasikan).toBe(100);
  });

  it("requires review when a source would change an existing draft", async () => {
    reconciliationFixture();

    await expect(saApiMock.applySIM3LON("batch-candidate"))
      .rejects.toMatchObject({ status: 409, code: "REVIEW_REQUIRED" });
  });

  it("allows a first import with no affected drafts to keep the legacy optional-review contract", async () => {
    const { db, agreement, plan } = reconciliationFixture();
    db.plans = db.plans.filter((row) => row.id !== plan.id);
    db.planRows = db.planRows.filter((row) => row.planId !== plan.id);
    db.sim3lonPlanSources = db.sim3lonPlanSources.filter((source) => source.planId !== plan.id);
    db.sim3lonSourceSnapshots = db.sim3lonSourceSnapshots.filter((source) =>
      source.batchId !== "batch-predecessor",
    );
    agreement.dialokasikan = agreement.terpakai;

    await expect(saApiMock.applySIM3LON("batch-candidate")).resolves.toMatchObject({
      id: "batch-candidate",
      outletTargetsWritten: 1,
      dailyTargetsWritten: 1,
    });
  });

  it("blocks duplicate outlet/date rows instead of doubling proposed demand", async () => {
    const { db, outlet } = reconciliationFixture();
    const candidate = db.sim3lonSourceSnapshots.find((source) =>
      source.batchId === "batch-candidate",
    )!;
    candidate.rows.push({ date: "2026-10-03", outletId: outlet.id, qty: 5 });

    const preview = await saApiMock.getSIM3LONReconciliation("batch-candidate");

    expect(preview.reviewReady).toBe(false);
    expect(preview.blockers).toContainEqual(expect.objectContaining({ code: "snapshot_duplicate" }));
  });

  it("does not treat a same-month legacy draft as if it had immutable provenance", async () => {
    const { db, plan } = reconciliationFixture();
    db.sim3lonPlanSources = db.sim3lonPlanSources.filter((source) => source.planId !== plan.id);

    const preview = await saApiMock.getSIM3LONReconciliation("batch-candidate");

    expect(preview.expectedPlanVersions).toContainEqual({
      planId: plan.id,
      version: plan.version,
      status: "Draft",
    });
    expect(preview.blockers).toContainEqual(expect.objectContaining({
      code: "legacy_provenance_missing",
      planId: plan.id,
    }));
  });
});
