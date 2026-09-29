/**
 * What every financial-statement adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/financialstatement package
 * field for field -- the mock's own engine (lib/engine.ts) computes the
 * same shape locally so a screen built against one adapter needs no
 * changes to run against the other. Financial-statements plan, phase P2.
 */

export type StatementLineKind =
  | "header"
  | "accounts"
  | "subtotal"
  | "inventory_change"
  | "inventory_opening"
  | "inventory_purchases"
  | "inventory_closing"
  | "current_year_earnings"
  | "retained_earnings";

export interface AccountAmount {
  accountId: string;
  code: string;
  name: string;
  amount: number;
}

export interface StatementLine {
  code: string;
  label: string;
  kind: StatementLineKind;
  parentCode: string | null;
  level: number;
  isBold: boolean;
  noteNumber: number | null;
  amount: number;
  ratio: number | null;
  accounts: AccountAmount[];
}

export interface StatementWarning {
  code: "UNMAPPED_ACCOUNT" | "NET_INCOME_MISMATCH" | "NOT_BALANCED" | "DOUBLE_MAPPED" | "INVENTORY_PURCHASES_MISMATCH";
  message: string;
  accountCode?: string;
  amount?: number;
}

export interface StatementPeriod {
  from?: string;
  to?: string;
  asOf?: string;
}

export interface LayoutRef {
  code: string;
  name: string;
}

export interface Statement {
  layout: LayoutRef;
  period: StatementPeriod;
  company: { legalName: string };
  lines: StatementLine[];
  balanced: boolean;
  warnings: StatementWarning[];
}

export type ProfitAndLossStatement = Statement;
export type BalanceSheetStatement = Statement;

export interface NoteLeaf {
  code: string;
  name: string;
  amount: number;
}

export interface StatementNote {
  noteNumber: number;
  lineCode: string;
  label: string;
  total: number;
  leaves: NoteLeaf[];
}

export interface NotesStatement {
  asOf: string;
  company: { legalName: string };
  notes: StatementNote[];
}

export interface GeneralLedgerLine {
  journalId: string;
  journalNumber: string;
  accountCode: string;
  date: string;
  description: string;
  sourceType: string;
  debit: number;
  credit: number;
  balance: number;
}

export interface GeneralLedgerPage {
  accountCode: string;
  accountName: string;
  from: string;
  to: string;
  openingBalance: number;
  lines: GeneralLedgerLine[];
  total: number;
  limit: number;
  offset: number;
}

export interface FinancialStatementsApi {
  getProfitAndLoss(input: {
    from: string;
    to: string;
    layout?: string;
    branchId?: string;
  }): Promise<ProfitAndLossStatement>;
  getBalanceSheet(input: { asOf: string; layout?: string; branchId?: string }): Promise<BalanceSheetStatement>;
  getBalanceSheetNotes(input: { asOf: string; layout?: string }): Promise<NotesStatement>;
  getGeneralLedger(input: {
    accountId: string;
    from: string;
    to: string;
    limit?: number;
    offset?: number;
  }): Promise<GeneralLedgerPage>;
  /** Downloads the .xlsx package -- the http adapter triggers a browser
   *  save; the mock adapter renders the same three sheets with
   *  `exportExcel`. Returns the number of bytes/rows written, only so a
   *  caller has something to show a toast about. */
  downloadPackage(input: {
    fiscalYear?: number;
    dateFrom?: string;
    dateTo?: string;
    asOf?: string;
    branchId?: string;
  }): Promise<void>;
}
