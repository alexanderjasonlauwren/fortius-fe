/**
 * What every opening-balance adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/openingbalance package: the
 * one-time import of a pre-go-live trial balance, receivables, payables
 * and asset register from an uploaded workbook (financial-statements plan
 * P7.2). Gap-closing plan, Phase E.
 */

export interface OpeningBalanceValidationError {
  sheet: string;
  row: number;
  message: string;
}

export interface OpeningBalancePreview {
  asOf: string;
  balanced: boolean;
  errors: OpeningBalanceValidationError[];
  trialBalanceRows: number;
  totalDebit: number;
  totalCredit: number;
  piutangRows: number;
  hutangRows: number;
  asetRows: number;
}

export interface OpeningBalanceCommitResult {
  journalId: string;
  invoicesCreated: number;
  purchasesCreated: number;
  assetsCreated: number;
}

export interface OpeningBalanceApi {
  /** Downloads the workbook template (every leaf account, pre-filled,
   *  plus empty Piutang/Hutang/Aset sheets) for the browser to save --
   *  resolves once the download starts, nothing to read back. */
  getTemplate(asOf: string): Promise<void>;
  /** Validates an uploaded workbook without writing anything. */
  previewOpeningBalance(asOf: string, file: File): Promise<OpeningBalancePreview>;
  /** Re-validates and writes. Refused if an opening balance was already
   *  committed, or if the workbook still has validation errors. */
  commitOpeningBalance(asOf: string, file: File): Promise<OpeningBalanceCommitResult>;
}
