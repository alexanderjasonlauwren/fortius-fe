/**
 * What every external-statement adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/externalstatement package:
 * an imported book (the accountant's or client's own figures), whose
 * subtotals are always recomputed from the same layout formulas
 * `financialstatements/lib/layouts.ts` already carries, never trusted
 * from the upload itself. Financial-statements plan's gap-closing phase,
 * Phase A.
 */

export type StatementKind = "profit_loss" | "balance_sheet";

/** One stored line -- either a real layout line's own (possibly
 *  recomputed) figure, or an extra line grouped under one. */
export interface ExternalStatementLine {
  lineCode: string | null;
  parentLineCode: string | null;
  accountCode: string | null;
  label: string;
  amount: number;
  sortOrder: number;
}

export interface ExternalStatement {
  id: string;
  label: string;
  kind: StatementKind;
  layoutCode: string;
  periodFrom: string | null;
  periodTo: string | null;
  asOf: string | null;
  sourceFileName: string | null;
  notes: string | null;
  lines: ExternalStatementLine[];
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface ImportStatementInput {
  file: File;
  label: string;
  kind: StatementKind;
  layoutCode?: string;
  periodFrom?: string;
  periodTo?: string;
  asOf?: string;
}

/** Same shape an import parses a workbook row into -- a hand correction
 *  is not exempt from the same "never trust a typed-in subtotal" rule. */
export interface ExternalStatementLineInput {
  lineCode: string | null;
  parentLineCode: string | null;
  accountCode: string | null;
  label: string;
  amount: number;
  sortOrder: number;
}

export interface UpdateLinesInput {
  id: string;
  version: number;
  lines: ExternalStatementLineInput[];
}

export interface StatementNote {
  layoutLineCode: string;
  scopeKey: string;
  externalStatementId?: string;
  note: string;
  version: number;
}

export interface UpsertNoteInput {
  layoutLineCode: string;
  scopeKey: string;
  externalStatementId?: string;
  note: string;
}

export interface ExternalStatementsApi {
  /** Triggers a browser download of the import template -- one row per
   *  layout line, plus (for balance_sheet) every note's own leaf
   *  accounts, pre-filled with codes and labels so a correction names a
   *  real line/account instead of inventing one. */
  getTemplate(kind: StatementKind, layoutCode?: string): Promise<void>;
  importStatement(input: ImportStatementInput): Promise<ExternalStatement>;
  listStatements(kind?: StatementKind): Promise<ExternalStatement[]>;
  getStatement(id: string): Promise<ExternalStatement>;
  updateLines(input: UpdateLinesInput): Promise<ExternalStatement>;
  deleteStatement(id: string): Promise<void>;
  upsertNote(input: UpsertNoteInput): Promise<StatementNote>;
}
