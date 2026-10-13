import { getList, type Page } from "@/lib/api";
import { financeApiHttp } from "@/features/finance/api/financeApi.http";
import type { FinanceSummaryApi, FinanceTotal, FinanceWindow } from "./financeSummary.contract";

interface PaymentRow {
  amount: number;
  payment_date: string;
  payment_status: string;
}

interface InvoiceRow {
  outstanding_amount: number;
  issued_at: string;
}

function inWindow(date: string, window: FinanceWindow): boolean {
  const day = date.slice(0, 10);
  return day >= window.from && day <= window.to;
}

function total<T>(page: Page<T>, sum: (rows: T[]) => number): FinanceTotal {
  const pagination = page.pagination;
  // These lists cannot filter by the reporting date yet. An omitted older
  // page may still contain this month's rows; never call a partial sum zero.
  if (
    pagination.has_next ||
    pagination.total_is_floor ||
    (pagination.total_pages ?? 1) > 1 ||
    (pagination.total_items ?? page.items.length) > page.items.length
  ) {
    return { complete: false, amount: null };
  }
  return { complete: true, amount: sum(page.items) };
}

export const financeSummaryHttp: FinanceSummaryApi = {
  async getVerifiedCash(window) {
    const page = await getList<PaymentRow>("/payments", {
      pageSize: 100,
      sort: [{ field: "payment_date", direction: "desc" }],
      filters: [{ field: "payment_status", operator: "eq", value: "verified" }],
    });
    return total(page, (rows) => rows
      .filter((row) => row.payment_status === "verified" && inWindow(row.payment_date, window))
      .reduce((sum, row) => sum + row.amount, 0));
  },
  async getMonthlyReceivables(window) {
    const page = await getList<InvoiceRow>("/invoices", {
      pageSize: 100,
      sort: [{ field: "issued_at", direction: "desc" }],
    });
    return total(page, (rows) => rows
      .filter((row) => inWindow(row.issued_at, window))
      .reduce((sum, row) => sum + Math.max(0, row.outstanding_amount), 0));
  },
  async getGrossMargin(window) {
    // The same laba kotor the ledger and the year-close show: derived from
    // the trial balance, which needs no account catalogue (and so no
    // finance.read.accounts) because each row carries its own type and role.
    const pl = await financeApiHttp.getProfitAndLoss(window);
    return { complete: true, amount: pl.labaKotor };
  },
};
