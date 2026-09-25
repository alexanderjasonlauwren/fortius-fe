export interface FinanceWindow {
  from: string;
  to: string;
}

export type FinanceTotal =
  | { complete: true; amount: number }
  | { complete: false; amount: null };

export interface FinanceSummaryApi {
  getVerifiedCash(window: FinanceWindow): Promise<FinanceTotal>;
  getMonthlyReceivables(window: FinanceWindow): Promise<FinanceTotal>;
  getGrossMargin(window: FinanceWindow): Promise<FinanceTotal>;
}
