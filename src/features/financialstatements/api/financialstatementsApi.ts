import { financialstatementsApiHttp } from "./financialstatementsApi.http";
import type { FinancialStatementsApi } from "./contract";

export type {
  AccountAmount,
  BalanceSheetStatement,
  CompareInfo,
  CompareSource,
  ExtraCompareLine,
  GeneralLedgerLine,
  GeneralLedgerPage,
  LayoutRef,
  NoteLeaf,
  NotesStatement,
  ProfitAndLossStatement,
  Statement,
  StatementLine,
  StatementLineKind,
  StatementNote,
  StatementPeriod,
  StatementWarning,
} from "./contract";

const api: FinancialStatementsApi = financialstatementsApiHttp;

export const getProfitAndLoss = api.getProfitAndLoss.bind(api);
export const getBalanceSheet = api.getBalanceSheet.bind(api);
export const getBalanceSheetNotes = api.getBalanceSheetNotes.bind(api);
export const getGeneralLedger = api.getGeneralLedger.bind(api);
export const downloadPackage = api.downloadPackage.bind(api);
