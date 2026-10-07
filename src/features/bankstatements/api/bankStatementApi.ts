/**
 * The bank statement adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { bankStatementApiMock } from "./bankStatementApi.mock";
import { bankStatementApiHttp } from "./bankStatementApi.http";
import type { BankStatementApi } from "./contract";

export type {
  AutoMatchResult,
  BankStatementApi,
  BankStatementImport,
  BankStatementLine,
  BankStatementLineStatus,
  BankStatementRule,
  ClassifyLineInput,
  ColumnMapping,
  CreateRuleInput,
  ImportBankStatementInput,
  Reconciliation,
  UpdateRuleInput,
} from "./contract";

const api: BankStatementApi = pick(bankStatementApiMock, bankStatementApiHttp);

export const importStatement = api.importStatement.bind(api);
export const listImports = api.listImports.bind(api);
export const getImport = api.getImport.bind(api);
export const autoMatch = api.autoMatch.bind(api);
export const classifyLine = api.classifyLine.bind(api);
export const getReconciliation = api.getReconciliation.bind(api);
export const listRules = api.listRules.bind(api);
export const createRule = api.createRule.bind(api);
export const updateRule = api.updateRule.bind(api);
