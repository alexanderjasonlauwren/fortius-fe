import { getList, getOne, type Page } from "@/lib/api";
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
    // Only the aggregate is needed, not the account catalogue fetched by the
    // full ledger adapter (which would introduce another permission).
    const response = await getOne<{ gross_profit: number }>(
      `/journals/profit-and-loss?date_from=${window.from}&date_to=${window.to}`,
    );
    return { complete: true, amount: response.gross_profit };
  },
};
