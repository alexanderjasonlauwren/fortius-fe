// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, resetDb } from "@/mocks/db";
import { setActiveScope } from "@/mocks/scope";
import { vendorApiMock } from "./vendorApi.mock";

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
  const db = getDb();
  setActiveScope({
    actingTenantId: db.branches[0].tenantId, visibleTenantIds: [db.branches[0].tenantId],
    branchId: db.branches[0].id, allowedBranchIds: [],
  });
});

describe("getVendors", () => {
  it("returns the seeded vendors, including PERTAMINA", async () => {
    const rows = await vendorApiMock.getVendors();
    expect(rows.some((r) => r.code === "PERTAMINA")).toBe(true);
    expect(rows.length).toBeGreaterThanOrEqual(3);
  });
});

describe("createVendor", () => {
  it("creates a vendor", async () => {
    const created = await vendorApiMock.createVendor({ code: "VND-NEW", name: "Toko Baru" });
    expect(created.code).toBe("VND-NEW");
    expect(getDb().vendors.some((v) => v.code === "VND-NEW")).toBe(true);
  });

  it("refuses a duplicate code", async () => {
    await expect(
      vendorApiMock.createVendor({ code: "PERTAMINA", name: "Duplikat" }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("updateVendor", () => {
  it("refuses a stale version", async () => {
    const row = getDb().vendors[0];
    await expect(
      vendorApiMock.updateVendor({ id: row.id, version: row.version + 1, name: "X" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("applies a partial update and bumps the version", async () => {
    const row = getDb().vendors[0];
    const { id, version } = row;
    const updated = await vendorApiMock.updateVendor({ id, version, status: "ina" });
    expect(updated.status).toBe("ina");
    expect(updated.version).toBe(version + 1);
  });
});

describe("deleteVendor", () => {
  it("removes the row so it no longer appears in a list", async () => {
    const row = getDb().vendors[0];
    await vendorApiMock.deleteVendor(row.id);
    const rows = await vendorApiMock.getVendors();
    expect(rows.some((r) => r.id === row.id)).toBe(false);
  });
});
