import { describe, expect, it } from "vitest";
import { createSeedDatabase } from "./seed";
import { accountByRole } from "./ledger";
import { raiseManualInvoice } from "./ar";

/**
 * Manual invoices ("Buat tagihan", financial-statements plan P5 /
 * gap-closing plan Phase C): raiseManualInvoice mirrors fortius-backend's
 * invoice.CreateManualInvoice. Exercised directly against a seeded
 * Database, the same reasoning ledger.test.ts gives for testing the
 * mock's own logic where it lives.
 */

const COMMODITY_PRODUCT_ID = "prd-001"; // LPG 3 kg Subsidi
const ACCESSORY_PRODUCT_ID = "prd-005"; // Segel Tabung

describe("raiseManualInvoice: registration", () => {
  it("posts fee + kit COGS from explicit fee_amount and kit_items", () => {
    const db = createSeedDatabase();
    const outlet = db.outlets[0];
    const journalsBefore = db.journals.length;

    const inv = raiseManualInvoice(
      db,
      {
        invoiceType: "registration",
        outletId: outlet.id,
        issueDate: "2026-10-07",
        feeAmount: 500_000,
        kitItems: [{ productId: ACCESSORY_PRODUCT_ID, qty: 2 }],
      },
      "Tester",
    );

    expect(inv.invoiceType).toBe("registration");
    expect(inv.deliveryId).toBeNull();
    expect(inv.subtotal).toBe(500_000);
    expect(inv.total).toBe(500_000);
    expect(inv.lines).toHaveLength(2);
    expect(inv.lines[1].hargaSatuan).toBe(0); // kit item is a zero-price record line

    expect(db.invoices.some((i) => i.id === inv.id)).toBe(true);
    expect(db.journals.length).toBe(journalsBefore + 1);

    const journal = db.journals.find((j) => j.sumber.tipe === "invoice" && j.sumber.id === inv.id)!;
    const piutangPendaftaran = accountByRole(db, "piutangPendaftaran").id;
    const pendapatanPendaftaran = accountByRole(db, "pendapatanPendaftaran").id;
    const hpp = accountByRole(db, "hpp").id;
    const persediaan = accountByRole(db, "persediaan").id;

    const debit = (akunId: string) => journal.lines.find((l) => l.akunId === akunId)?.debit ?? 0;
    const kredit = (akunId: string) => journal.lines.find((l) => l.akunId === akunId)?.kredit ?? 0;
    expect(debit(piutangPendaftaran)).toBe(500_000);
    expect(kredit(pendapatanPendaftaran)).toBe(500_000);

    const segel = db.products.find((p) => p.id === ACCESSORY_PRODUCT_ID)!;
    const expectedCogs = segel.hargaBeli * 2;
    expect(debit(hpp)).toBe(expectedCogs);
    expect(kredit(persediaan)).toBe(expectedCogs);

    const totalDebit = journal.lines.reduce((s, l) => s + l.debit, 0);
    const totalKredit = journal.lines.reduce((s, l) => s + l.kredit, 0);
    expect(totalDebit).toBe(totalKredit);
  });

  it("falls back to the named package's own fee and items", () => {
    const db = createSeedDatabase();
    const outlet = db.outlets[0];
    const pkg = db.registrationPackages[0];

    const inv = raiseManualInvoice(
      db,
      { invoiceType: "registration", outletId: outlet.id, issueDate: "2026-10-07", packageId: pkg.id },
      "Tester",
    );

    expect(inv.subtotal).toBe(pkg.feeAmount);
    expect(inv.lines).toHaveLength(1 + pkg.items.length);
  });

  it("refuses a kit item that is not an accessory product", () => {
    const db = createSeedDatabase();
    const outlet = db.outlets[0];

    expect(() =>
      raiseManualInvoice(
        db,
        {
          invoiceType: "registration", outletId: outlet.id, issueDate: "2026-10-07",
          feeAmount: 500_000, kitItems: [{ productId: COMMODITY_PRODUCT_ID, qty: 1 }],
        },
        "Tester",
      ),
    ).toThrow(/aksesori/);
  });

  it("refuses when there is no fee from either source", () => {
    const db = createSeedDatabase();
    const outlet = db.outlets[0];
    expect(() =>
      raiseManualInvoice(db, { invoiceType: "registration", outletId: outlet.id, issueDate: "2026-10-07" }, "Tester"),
    ).toThrow(/pendaftaran/);
  });
});

describe("raiseManualInvoice: other", () => {
  it("posts each line to its own named revenue account", () => {
    const db = createSeedDatabase();
    const outlet = db.outlets[0];
    const pendapatanLain = db.accounts.find((a) => a.role === "pendapatanLain")!;

    const inv = raiseManualInvoice(
      db,
      {
        invoiceType: "other", outletId: outlet.id, issueDate: "2026-10-07",
        lines: [{ description: "Sewa tempat", amount: 250_000, revenueAccountId: pendapatanLain.id }],
      },
      "Tester",
    );

    expect(inv.invoiceType).toBe("other");
    expect(inv.subtotal).toBe(250_000);
    const journal = db.journals.find((j) => j.sumber.tipe === "invoice" && j.sumber.id === inv.id)!;
    const piutang = accountByRole(db, "piutang").id;
    expect(journal.lines.find((l) => l.akunId === piutang)?.debit).toBe(250_000);
    expect(journal.lines.find((l) => l.akunId === pendapatanLain.id)?.kredit).toBe(250_000);
  });

  it("refuses a line naming a non-revenue account", () => {
    const db = createSeedDatabase();
    const outlet = db.outlets[0];
    const piutangAccount = db.accounts.find((a) => a.role === "piutang")!;

    expect(() =>
      raiseManualInvoice(
        db,
        {
          invoiceType: "other", outletId: outlet.id, issueDate: "2026-10-07",
          lines: [{ description: "Salah akun", amount: 100_000, revenueAccountId: piutangAccount.id }],
        },
        "Tester",
      ),
    ).toThrow(/akun pendapatan/);
  });

  it("refuses with no lines", () => {
    const db = createSeedDatabase();
    const outlet = db.outlets[0];
    expect(() =>
      raiseManualInvoice(db, { invoiceType: "other", outletId: outlet.id, issueDate: "2026-10-07" }, "Tester"),
    ).toThrow(/baris/);
  });
});
