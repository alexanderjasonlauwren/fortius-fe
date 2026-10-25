/**
 * What every bank statement adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/bankstatement package:
 * rekening koran import, auto-match, manual classification and
 * reconciliation (financial-statements plan P4.2). Financial-statements
 * plan's gap-closing phase, Phase B.
 */

export type BankStatementLineStatus = "unmatched" | "matched" | "posted" | "ignored";

export interface BankStatementLine {
  id: string;
  lineNo: number;
  lineDate: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance?: number;
  status: BankStatementLineStatus;
  matchedSourceType?: string;
  cashVoucherId?: string;
}

export interface BankStatementImport {
  id: string;
  bankAccountId: string;
  bankAccountLabel: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: number;
  closingBalance: number;
  fileName: string;
  rowCount: number;
  newRowCount: number;
  createdAt: string;
  lines?: BankStatementLine[];
}

/** Tells the parser which column of the uploaded file holds what. Omitted
 *  fields fall back to the BNI default preset. */
export interface ColumnMapping {
  headerRow?: number;
  dateCol?: number;
  descCol?: number;
  debitCol?: number;
  creditCol?: number;
  /** Optional: a file with no running-balance column skips the row-by-row
   *  balance check and relies on the aggregate opening/closing check alone. */
  balanceCol?: number;
}

export interface ImportBankStatementInput {
  file: File;
  bankAccountId: string;
  periodFrom: string;
  periodTo: string;
  openingBalance: number;
  closingBalance: number;
  columnMapping?: ColumnMapping;
}

export interface AutoMatchResult {
  matched: number;
  posted: number;
  stillUnmatched: number;
}

/** Resolves one unmatched line by hand, exactly one of three ways:
 *  accountId posts a new cash voucher against that leaf account;
 *  matchSourceType+matchSourceId links an existing document that already
 *  posted its own journal; ignore marks the line as not the tenant's own
 *  money movement to post at all. */
export interface ClassifyLineInput {
  lineId: string;
  accountId?: string;
  matchSourceType?: string;
  matchSourceId?: string;
  ignore?: boolean;
}

export interface Reconciliation {
  bankAccountId: string;
  asOf: string;
  statementBalance?: number;
  ledgerBalance: number;
  difference?: number;
  unmatchedCount: number;
}

export interface BankStatementRule {
  id: string;
  pattern: string;
  direction: "in" | "out";
  accountId: string;
  accountCode: string;
  accountName: string;
  sortOrder: number;
  isActive: boolean;
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateRuleInput {
  pattern: string;
  direction: "in" | "out";
  accountId: string;
  sortOrder?: number;
}

export interface UpdateRuleInput {
  id: string;
  version: number;
  pattern: string;
  direction: "in" | "out";
  accountId: string;
  sortOrder: number;
  isActive: boolean;
}

export interface BankStatementApi {
  importStatement(input: ImportBankStatementInput): Promise<BankStatementImport>;
  listImports(bankAccountId?: string): Promise<BankStatementImport[]>;
  getImport(id: string): Promise<BankStatementImport>;
  autoMatch(id: string): Promise<AutoMatchResult>;
  classifyLine(input: ClassifyLineInput): Promise<BankStatementLine>;
  getReconciliation(bankAccountId: string, asOf: string): Promise<Reconciliation>;
  listRules(): Promise<BankStatementRule[]>;
  createRule(input: CreateRuleInput): Promise<BankStatementRule>;
  updateRule(input: UpdateRuleInput): Promise<BankStatementRule>;
}
