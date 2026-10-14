import { describe, expect, it } from "vitest";
import { balancesByCode } from "./ledgerBalance";
import type { TrialBalanceRow } from "@/features/finance/lib/trialBalance";

const row = (kode: string, d: number, k: number) =>
  ({ akun: { kode }, saldoAkhirDebit: d, saldoAkhirKredit: k }) as unknown as TrialBalanceRow;

describe("ledger balances by code", () => {
  it("nets each account's closing sides, a credit balance as negative", () => {
    const m = balancesByCode([row("1-1101", 2_500_000, 0), row("1-1102", 0, 120_000.5)]);
    expect(m.get("1-1101")).toBe(2_500_000);
    expect(m.get("1-1102")).toBe(-120_000.5);
    expect(m.get("9-9999")).toBeUndefined();
  });
});
