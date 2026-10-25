import type { AccountEntity, AccountType } from "@/types/domain";
import type { AccountBalance } from "./accounts";

/**
 * One account on the Neraca Saldo (`GET /financial-statements/trial-balance`).
 * Every balance sits on exactly one side, as the backend splits it.
 */
export interface TrialBalanceRow {
  akun: AccountEntity;
  /** The account's system role (cogs, receivable, ...), when it has one. */
  role?: string;
  saldoAwalDebit: number;
  saldoAwalKredit: number;
  debit: number;
  kredit: number;
  saldoAkhirDebit: number;
  saldoAkhirKredit: number;
}

export interface TrialBalanceTotals {
  saldoAwalDebit: number;
  saldoAwalKredit: number;
  debit: number;
  kredit: number;
  saldoAkhirDebit: number;
  saldoAkhirKredit: number;
}

export interface ProfitAndLossFigures {
  pendapatan: AccountBalance[];
  beban: AccountBalance[];
  totalPendapatan: number;
  totalBeban: number;
  labaKotor: number;
  labaBersih: number;
}

const round2 = (n: number) => Math.round(n * 100) / 100;

function asBalance(row: TrialBalanceRow, saldo: number): AccountBalance {
  return { akun: row.akun, debit: row.debit, kredit: row.kredit, saldo: round2(saldo) };
}

/**
 * The laba rugi for the trial balance's own window, read off its movement
 * columns.
 *
 * The trial balance already applies the statement rules -- closing journals
 * excluded, so a closed year still shows its income -- which is why the
 * ledger's laba rugi, the year-close preview and the dashboard margin are
 * derived from it rather than from a second P&L engine. Revenue is credit
 * minus debit, so a contra account (sales_returns) reduces it; HPP is the
 * `cogs` role, and gross profit is revenue less HPP only.
 */
export function profitAndLossFromTrialBalance(rows: TrialBalanceRow[]): ProfitAndLossFigures {
  const pendapatan: AccountBalance[] = [];
  const beban: AccountBalance[] = [];
  let totalPendapatan = 0;
  let totalHpp = 0;
  let totalBeban = 0;
  for (const row of rows) {
    if (row.akun.tipe === "Pendapatan") {
      const amount = row.kredit - row.debit;
      if (amount === 0) continue;
      pendapatan.push(asBalance(row, amount));
      totalPendapatan += amount;
    } else if (row.akun.tipe === "Beban") {
      const amount = row.debit - row.kredit;
      if (amount === 0) continue;
      beban.push(asBalance(row, amount));
      totalBeban += amount;
      if (row.role === "cogs") totalHpp += amount;
    }
  }
  return {
    pendapatan,
    beban,
    totalPendapatan: round2(totalPendapatan),
    totalBeban: round2(totalBeban),
    labaKotor: round2(totalPendapatan - totalHpp),
    labaBersih: round2(totalPendapatan - totalBeban),
  };
}

/** The backend's account_type to the console's, defaulting to Aset. */
export const ACCOUNT_TYPE: Record<string, AccountType> = {
  asset: "Aset",
  liability: "Kewajiban",
  equity: "Ekuitas",
  revenue: "Pendapatan",
  expense: "Beban",
};
