import { describe, expect, it } from "vitest";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { favourites, hubEntries } from "./catalogue";

const catalogue = [
  { key: "cash_flow", title: "Arus Kas", category: "ikhtisar" as const, description: "", periodKind: "range" as const, branched: true },
  { key: "ar_aging", title: "Umur Piutang", category: "penjualan" as const, description: "", periodKind: "as_of" as const, branched: true },
];
const holding = (...codes: string[]) => (code: string) => codes.includes(code);

describe("Laporan hub entries", () => {
  it("list only what this person may open", () => {
    const onlyReports = hubEntries(catalogue, holding(PERMISSIONS.FINANCE_REPORTS_VIEW)).map((e) => e.key);
    expect(onlyReports).toEqual(["cash_flow", "ar_aging"]);
    const onlyStatements = hubEntries(catalogue, holding(PERMISSIONS.FINANCIAL_STATEMENTS_VIEW)).map((e) => e.key);
    expect(onlyStatements).toContain("laba_rugi");
    expect(onlyStatements).not.toContain("cash_flow");
    expect(onlyStatements).not.toContain("neraca_saldo");
  });

  it("link the statements and working lists to their own pages", () => {
    const all = hubEntries(catalogue, holding(PERMISSIONS.FINANCE_REPORTS_VIEW, PERMISSIONS.FINANCIAL_STATEMENTS_VIEW,
      PERMISSIONS.JOURNALS_VIEW, PERMISSIONS.TRANSACTIONS_VIEW));
    const href = (k: string) => all.find((e) => e.key === k)?.href;
    expect(href("neraca")).toBe("/financial-statements?tab=neraca");
    expect(href("neraca_saldo")).toBe("/ledger?tab=neraca-saldo");
    expect(href("daftar_penjualan")).toBe("/transactions");
    expect(all.find((e) => e.key === "daftar_penjualan")?.category).toBe("penjualan");
    expect(href("ar_aging")).toBe("/laporan/ar_aging");
  });

  it("put the most-opened first, skipping what this person cannot open", () => {
    const all = hubEntries(catalogue, holding(PERMISSIONS.FINANCE_REPORTS_VIEW));
    expect(favourites(all).map((e) => e.key)).toEqual(["cash_flow", "ar_aging"]);
  });
});
