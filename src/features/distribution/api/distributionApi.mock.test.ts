// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, resetDb } from "@/mocks/db";
import { getActiveScope } from "@/mocks/scope";
import { distributionApiMock } from "./distributionApi.mock";

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

describe("mock assignment lifecycle and concurrency", () => {
  it("rejects a stale version without changing the plan", async () => {
    const draft = (await distributionApiMock.getPlanList()).find((plan) => plan.status === "Draft")!;

    await expect(
      distributionApiMock.applyAssignment(draft.id, [], draft.version + 1),
    ).rejects.toMatchObject({ status: 409 });

    expect((await distributionApiMock.getPlan(draft.id)).version).toBe(draft.version);
  });

  it("rejects assignment for a non-draft plan", async () => {
    const confirmed = (await distributionApiMock.getPlanList()).find((plan) => plan.status !== "Draft")!;

    await expect(
      distributionApiMock.applyAssignment(confirmed.id, [], confirmed.version),
    ).rejects.toThrow(/dikonfirmasi/);
  });

  it("accepts a fresh draft version and advances it", async () => {
    const draft = (await distributionApiMock.getPlanList()).find((plan) => plan.status === "Draft")!;

    await distributionApiMock.applyAssignment(draft.id, [], draft.version);

    expect((await distributionApiMock.getPlan(draft.id)).version).toBe(draft.version + 1);
  });
});

describe("mock source-backed creation", () => {
  function addReadySource(date = "2026-10-03") {
    const db = getDb();
    const scope = getActiveScope();
    const branchId = scope.branchId ?? db.branches[0].id;
    const agreement = db.scheduleAgreements.find((row) => row.status === "Aktif")!;
    agreement.tenantId = scope.actingTenantId;
    agreement.branchId = branchId;
    agreement.productId = db.products[0].id;
    const outlet = db.outlets[0];
    outlet.tenantId = agreement.tenantId;
    outlet.branchId = agreement.branchId;
    db.sim3lonSourceSnapshots.push({
      tenantId: agreement.tenantId, branchId: agreement.branchId, batchId: "batch-source", saId: agreement.id,
      productId: agreement.productId!, periodMonth: date.slice(0, 7), status: "applied", complete: true,
      createdAt: "2026-10-01T00:00:00.000Z",
      rows: [{ date, outletId: outlet.id, qty: 50 }],
    });
    return { db, agreement, outlet, date };
  }

  it("creates plan, lines, and provenance together and rejects duplicate consumption", async () => {
    const { db, outlet, date } = addReadySource();
    const created = await distributionApiMock.createSourcePlan({ batchId: "batch-source", tanggal: date });
    expect(db.planRows).toContainEqual(expect.objectContaining({ planId: created.id, outletId: outlet.id, jumlahUnit: 50 }));
    expect(db.sim3lonPlanSources).toContainEqual(expect.objectContaining({ planId: created.id, batchId: "batch-source", operationalDate: date }));

    await expect(distributionApiMock.createSourcePlan({ batchId: "batch-source", tanggal: date })).rejects.toMatchObject({ status: 409 });
  });

  it("does not leave partial rows for an incomplete source", async () => {
    const { db, date } = addReadySource("2026-10-04");
    db.sim3lonSourceSnapshots[0].complete = false;
    const before = { plans: db.plans.length, rows: db.planRows.length, sources: db.sim3lonPlanSources.length };

    await expect(distributionApiMock.createSourcePlan({ batchId: "batch-source", tanggal: date })).rejects.toMatchObject({ status: 409 });
    expect({ plans: db.plans.length, rows: db.planRows.length, sources: db.sim3lonPlanSources.length }).toEqual(before);
  });
});
