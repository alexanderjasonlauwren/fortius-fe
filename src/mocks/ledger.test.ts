import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "./seed";
import { accountBalances, createAccount, leafAccounts, upgradeChart } from "./ledger";

/**
 * Chart-of-accounts mutations (financial-statements plan, phase P1):
 * createAccount mirrors fortius-backend's account.CreateAccount,
 * upgradeChart mirrors tenantprovisioning.Service.UpgradeChart. Both are
 * exercised directly against a seeded Database rather than through the
 * finance adapter, the same reasoning mocks/scope.test.ts gives for testing
 * the mock's own logic where it lives.
 */

describe("createAccount", () => {
  it("refuses a duplicate code", () => {
    const db = createSeedDatabase();
    expect(() =>
      createAccount(db, { kode: "1-1000", nama: "Duplikat", tipe: "Aset" }),
    ).toThrow(/sudah ada/);
  });

  it("creates a plain, non-system sub-account under the named parent", () => {
    const db = createSeedDatabase();
    const parent = db.accounts.find((a) => a.kode === "1-0000")!;
    const before = db.accounts.length;

    const created = createAccount(db, {
      kode: "1-9000",
      nama: "Akun Kustom",
      tipe: "Aset",
      indukId: parent.id,
    });

    expect(created.sistem).toBe(false);
    expect(created.induk).toBe("1-0000");
    expect(created.saldoNormal).toBe("debit");
    expect(db.accounts).toHaveLength(before + 1);
    expect(db.accounts.some((a) => a.kode === "1-9000")).toBe(true);
  });
});

describe("upgradeChart", () => {
  it("reports nothing to add against an already-seeded chart", () => {
    const db = createSeedDatabase();
    const result = upgradeChart(db, true);
    expect(result.akunDitambahkan).toEqual([]);
    expect(result.konflik).toEqual([]);
  });

  it("dry run reports missing accounts and writes nothing", () => {
    const db = createSeedDatabase();
    db.accounts = db.accounts.filter((a) => a.kode !== "1-2100");
    const before = db.accounts.length;

    const result = upgradeChart(db, true);

    expect(result.akunDitambahkan).toContain("1-2100");
    expect(db.accounts).toHaveLength(before);
    expect(db.accounts.some((a) => a.kode === "1-2100")).toBe(false);
  });

  it("apply adds exactly what the dry run reported, and a second apply is a no-op", () => {
    const db = createSeedDatabase();
    db.accounts = db.accounts.filter((a) => a.kode !== "1-2100" && a.kode !== "1-2900");

    const dry = upgradeChart(db, true);
    expect([...dry.akunDitambahkan].sort()).toEqual(["1-2100", "1-2900"]);

    const applied = upgradeChart(db, false);
    expect([...applied.akunDitambahkan].sort()).toEqual(["1-2100", "1-2900"]);
    expect(db.accounts.some((a) => a.kode === "1-2100")).toBe(true);
    expect(db.accounts.some((a) => a.kode === "1-2900")).toBe(true);

    const again = upgradeChart(db, false);
    expect(again.akunDitambahkan).toEqual([]);
    expect(again.konflik).toEqual([]);
  });

  it("reports a conflict and leaves the tenant's own account untouched", () => {
    const db = createSeedDatabase();
    const account = db.accounts.find((a) => a.kode === "1-2100")!;
    account.tipe = "Kewajiban"; // as if the tenant repurposed the code

    const result = upgradeChart(db, true);

    const conflict = result.konflik.find((k) => k.kode === "1-2100");
    expect(conflict).toBeDefined();
    expect(result.akunDitambahkan).not.toContain("1-2100");

    upgradeChart(db, false);
    expect(db.accounts.find((a) => a.kode === "1-2100")?.tipe).toBe("Kewajiban");
  });
});

// Mirrors the real backend's own ledger.Post guard ("Akun %s adalah akun
// induk; posting harus ke sub-akun"), caught live posting a manual journal
// to "5-4000 Beban Umum dan Administrasi" -- a grouping header, not a
// postable leaf (gap-closing plan, Phase E).
describe("leafAccounts", () => {
  it("excludes an account another account names as its own parent", () => {
    const db = createSeedDatabase();
    const rows = accountBalances(db);

    const result = leafAccounts(rows);

    expect(result.some((r) => r.akun.kode === "5-4000")).toBe(false); // has children (5-4100, ...)
    expect(result.some((r) => r.akun.kode === "5-4100")).toBe(true); // a real leaf
  });
});
