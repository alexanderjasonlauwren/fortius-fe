/**
 * The financial-statements adapter this build uses.
 *
 * Both implementations are passed to `pick`, so the choice is visible here
 * and a build cannot silently fall back to the mock.
 */
import { pick } from "@/lib/dataSource";
import { financialstatementsApiMock } from "./financialstatementsApi.mock";
import { financialstatementsApiHttp } from "./financialstatementsApi.http";
import type { FinancialStatementsApi } from "./contract";

export type {
  AccountAmount,
  BalanceSheetStatement,
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

const api: FinancialStatementsApi = pick(financialstatementsApiMock, financialstatementsApiHttp);

export const getProfitAndLoss = api.getProfitAndLoss.bind(api);
export const getBalanceSheet = api.getBalanceSheet.bind(api);
export const getBalanceSheetNotes = api.getBalanceSheetNotes.bind(api);
export const getGeneralLedger = api.getGeneralLedger.bind(api);
export const downloadPackage = api.downloadPackage.bind(api);
