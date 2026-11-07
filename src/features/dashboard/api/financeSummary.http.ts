import { getAllPages } from "@/lib/api";
import { addDays, isoDate } from "@/lib/date";
import { financeApiHttp } from "@/features/finance/api/financeApi.http";
import type { FinanceSummaryApi, FinanceTotal, FinanceWindow } from "./financeSummary.contract";

interface PaymentRow {
  amount: number;
  payment_status: string;
}

interface InvoiceRow {
  outstanding_amount: number;
}

/**
 * The window as the server reads it: `gte` the first day, `lt` the day after
 * the last, on the same UTC day the ledger reports use. These lists used to be
 * read one newest page at a time and windowed here, which could only ever say
 * "incomplete" once a month held more than 100 rows.
 */
function windowFilters(field: string, window: FinanceWindow) {
  const exclusiveEnd = isoDate(addDays(new Date(`${window.to}T00:00:00Z`), 1));
  return [
    { field, operator: "gte" as const, value: window.from },
    { field, operator: "lt" as const, value: exclusiveEnd },
  ];
}

/** A sum over every row, or no figure at all when the walk stopped short. */
function total<T>(result: { items: T[]; truncated: boolean }, sum: (rows: T[]) => number): FinanceTotal {
  return result.truncated ? { complete: false, amount: null } : { complete: true, amount: sum(result.items) };
}

export const financeSummaryHttp: FinanceSummaryApi = {
  async getVerifiedCash(window) {
    const result = await getAllPages<PaymentRow>("/payments", {
      sort: [{ field: "payment_date", direction: "desc" }],
      filters: [
        { field: "payment_status", operator: "eq", value: "verified" },
        ...windowFilters("payment_date", window),
      ],
    });
    return total(result, (rows) => rows.reduce((sum, row) => sum + row.amount, 0));
  },
  async getMonthlyReceivables(window) {
    const result = await getAllPages<InvoiceRow>("/invoices", {
      sort: [{ field: "issued_at", direction: "desc" }],
      filters: windowFilters("issued_at", window),
    });
    return total(result, (rows) => rows.reduce((sum, row) => sum + Math.max(0, row.outstanding_amount), 0));
  },
  async getGrossMargin(window) {
    // The same laba kotor the ledger and the year-close show: derived from
    // the trial balance, which needs no account catalogue (and so no
    // finance.read.accounts) because each row carries its own type and role.
    const pl = await financeApiHttp.getProfitAndLoss(window);
    return { complete: true, amount: pl.labaKotor };
  },
};
