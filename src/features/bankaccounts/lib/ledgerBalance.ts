import type { TrialBalanceRow } from "@/features/finance/lib/trialBalance";

/**
 * Each account's closing balance (debit minus credit) by account code, from
 * a trial balance -- what a kas/bank account holds in the books, to set
 * beside its bank statement.
 */
export function balancesByCode(rows: TrialBalanceRow[]): Map<string, number> {
  const out = new Map<string, number>();
  for (const r of rows) {
    out.set(r.akun.kode, Math.round((r.saldoAkhirDebit - r.saldoAkhirKredit) * 100) / 100);
  }
  return out;
}
