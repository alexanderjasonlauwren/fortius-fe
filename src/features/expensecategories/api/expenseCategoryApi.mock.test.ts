// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, resetDb } from "@/mocks/db";
import { setActiveScope } from "@/mocks/scope";
import { expenseCategoryApiMock } from "./expenseCategoryApi.mock";

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

describe("getExpenseCategories", () => {
  it("returns the seeded starting categories, sorted by sort_order", async () => {
    const rows = await expenseCategoryApiMock.getExpenseCategories();
    expect(rows.length).toBeGreaterThanOrEqual(12);
    expect(rows[0].code).toBe("fuel");
    expect(rows.every((r) => r.accountCode)).toBe(true);
  });
});

describe("createExpenseCategory", () => {
  it("creates a category against a real account", async () => {
    const account = getDb().accounts.find((a) => a.kode === "5-3900")!;

    const created = await expenseCategoryApiMock.createExpenseCategory({
      code: "new_cat",
      name: "Kategori Baru",
      accountId: account.id,
      groupLabel: "HR & GA",
    });

    expect(created.code).toBe("new_cat");
    expect(created.accountCode).toBe("5-3900");
    expect(getDb().expenseCategories.some((c) => c.code === "new_cat")).toBe(true);
  });

  it("refuses a duplicate code", async () => {
    const account = getDb().accounts.find((a) => a.kode === "5-3900")!;
    await expect(
      expenseCategoryApiMock.createExpenseCategory({
        code: "fuel",
        name: "Duplikat",
        accountId: account.id,
        groupLabel: "HR & GA",
      }),
    ).rejects.toMatchObject({ status: 409 });
  });
});

describe("updateExpenseCategory", () => {
  it("refuses a stale version", async () => {
    const row = getDb().expenseCategories[0];
    await expect(
      expenseCategoryApiMock.updateExpenseCategory({ id: row.id, version: row.version + 1, name: "X" }),
    ).rejects.toMatchObject({ status: 409 });
  });

  it("applies a partial update and bumps the version", async () => {
    const row = getDb().expenseCategories[0];
    const { id, version } = row;
    const updated = await expenseCategoryApiMock.updateExpenseCategory({
      id, version, groupLabel: "Kelompok Baru",
    });
    expect(updated.groupLabel).toBe("Kelompok Baru");
    expect(updated.version).toBe(version + 1);
  });
});

describe("deleteExpenseCategory", () => {
  it("removes the row so it no longer appears in a list", async () => {
    const row = getDb().expenseCategories[0];
    await expenseCategoryApiMock.deleteExpenseCategory(row.id);
    const rows = await expenseCategoryApiMock.getExpenseCategories();
    expect(rows.some((r) => r.id === row.id)).toBe(false);
  });
});
