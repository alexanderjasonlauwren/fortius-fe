// @vitest-environment jsdom
import { beforeEach, describe, expect, it, vi } from "vitest";

vi.mock("@/mocks/db", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/mocks/db")>();
  return { ...actual, latency: async () => undefined };
});

import { getDb, mutate, resetDb } from "@/mocks/db";
import { setActiveScope } from "@/mocks/scope";
import { accountByRole } from "@/mocks/ledger";
import { purchaseApiMock } from "./purchaseApi.mock";

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

let vendorId: string;
let productId: string;

beforeEach(() => {
  localStorage.clear();
  resetDb();
  const db = getDb();
  setActiveScope({
    actingTenantId: db.branches[0].tenantId, visibleTenantIds: [db.branches[0].tenantId],
    branchId: db.branches[0].id, allowedBranchIds: [],
  });
  vendorId = db.vendors.find((v) => v.code !== "PERTAMINA")!.id;
  productId = db.products[0].id;
});

describe("recordGeneralPurchase", () => {
  it("posts a balanced journal debiting the role account and crediting hutangUsaha", async () => {
    const db = getDb();
    const payableBefore = db.journals
      .flatMap((j) => j.lines)
      .filter((l) => l.akunId === accountByRole(db, "hutangUsaha").id)
      .reduce((s, l) => s + l.kredit, 0);

    const purchase = await purchaseApiMock.recordGeneralPurchase({
      supplierId: vendorId,
      date: "2026-10-08",
      lines: [{ productId, quantity: 2, unitCost: 50000 }],
    });

    expect(purchase.totalAmount).toBe(100000);
    expect(purchase.paymentStatus).toBe("unpaid");

    const after = getDb();
    const payableAfter = after.journals
      .flatMap((j) => j.lines)
      .filter((l) => l.akunId === accountByRole(after, "hutangUsaha").id)
      .reduce((s, l) => s + l.kredit, 0);
    expect(payableAfter).toBe(payableBefore + 100000);
  });

  it("groups a line by the product's own inventory account override instead of the role", async () => {
    const overrideAccount = getDb().accounts.find((a) => a.kode === "1-1311")!;
    mutate((db) => {
      const product = db.products.find((p) => p.id === productId)!;
      product.inventoryAccountCode = "1-1311";
    });

    await purchaseApiMock.recordGeneralPurchase({
      supplierId: vendorId,
      date: "2026-10-08",
      lines: [{ productId, quantity: 1, unitCost: 75000 }],
    });

    const db = getDb();
    const lastJournal = db.journals[0];
    const overrideLine = lastJournal.lines.find((l) => l.akunId === overrideAccount.id);
    expect(overrideLine?.debit).toBe(75000);
    const roleLine = lastJournal.lines.find((l) => l.akunId === accountByRole(db, "persediaan").id);
    expect(roleLine).toBeUndefined();
  });

  it("refuses an unknown vendor", async () => {
    await expect(
      purchaseApiMock.recordGeneralPurchase({
        supplierId: "nope", date: "2026-10-08",
        lines: [{ productId, quantity: 1, unitCost: 1000 }],
      }),
    ).rejects.toThrow(/[Vv]endor/);
  });
});

describe("payPurchase", () => {
  it("posts debit hutangUsaha / credit bank and flips payment_status", async () => {
    const created = await purchaseApiMock.recordGeneralPurchase({
      supplierId: vendorId, date: "2026-10-08",
      lines: [{ productId, quantity: 1, unitCost: 20000 }],
    });

    const paid = await purchaseApiMock.payPurchase({ id: created.id, version: created.version });

    expect(paid.paymentStatus).toBe("paid");
    const db = getDb();
    const lastJournal = db.journals[0];
    expect(lastJournal.lines.some((l) => l.akunId === accountByRole(db, "hutangUsaha").id && l.debit === 20000)).toBe(true);
    expect(lastJournal.lines.some((l) => l.akunId === accountByRole(db, "bank").id && l.kredit === 20000)).toBe(true);
  });

  it("refuses a stale version", async () => {
    const created = await purchaseApiMock.recordGeneralPurchase({
      supplierId: vendorId, date: "2026-10-08",
      lines: [{ productId, quantity: 1, unitCost: 20000 }],
    });

    await expect(
      purchaseApiMock.payPurchase({ id: created.id, version: created.version + 1 }),
    ).rejects.toMatchObject({ status: 409 });
  });
});
