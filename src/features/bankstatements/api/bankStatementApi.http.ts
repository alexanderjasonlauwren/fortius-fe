/**
 * Rekening koran import, auto-match, classification and reconciliation,
 * against the real API.
 *
 * Every field is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/bankstatement response shapes.
 */
import { getList, getOne, send, upload } from "@/lib/api";
import type {
  AutoMatchResult,
  BankStatementApi,
  BankStatementImport,
  BankStatementLine,
  BankStatementRule,
  ClassifyLineInput,
  CreateRuleInput,
  ImportBankStatementInput,
  Reconciliation,
  UpdateRuleInput,
} from "./contract";

interface LineResponse {
  id: string;
  line_no: number;
  line_date: string;
  description: string;
  reference: string;
  debit: number;
  credit: number;
  balance?: number;
  status: string;
  matched_source_type?: string;
  cash_voucher_id?: string;
}

interface ImportResponse {
  id: string;
  bank_account_id: string;
  bank_account_label: string;
  period_from: string;
  period_to: string;
  opening_balance: number;
  closing_balance: number;
  file_name: string;
  row_count: number;
  new_row_count: number;
  created_at: string;
  lines?: LineResponse[];
}

interface RuleResponse {
  id: string;
  pattern: string;
  direction: string;
  account_id: string;
  account_code: string;
  account_name: string;
  sort_order: number;
  is_active: boolean;
  version: number;
  created_at: string;
  updated_at: string;
}

function toLine(row: LineResponse): BankStatementLine {
  return {
    id: row.id,
    lineNo: row.line_no,
    lineDate: row.line_date,
    description: row.description,
    reference: row.reference,
    debit: row.debit,
    credit: row.credit,
    balance: row.balance,
    status: row.status as BankStatementLine["status"],
    matchedSourceType: row.matched_source_type,
    cashVoucherId: row.cash_voucher_id,
  };
}

function toImport(row: ImportResponse): BankStatementImport {
  return {
    id: row.id,
    bankAccountId: row.bank_account_id,
    bankAccountLabel: row.bank_account_label,
    periodFrom: row.period_from,
    periodTo: row.period_to,
    openingBalance: row.opening_balance,
    closingBalance: row.closing_balance,
    fileName: row.file_name,
    rowCount: row.row_count,
    newRowCount: row.new_row_count,
    createdAt: row.created_at,
    lines: row.lines?.map(toLine),
  };
}

function toRule(row: RuleResponse): BankStatementRule {
  return {
    id: row.id,
    pattern: row.pattern,
    direction: row.direction as BankStatementRule["direction"],
    accountId: row.account_id,
    accountCode: row.account_code,
    accountName: row.account_name,
    sortOrder: row.sort_order,
    isActive: row.is_active,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function importStatement(input: ImportBankStatementInput): Promise<BankStatementImport> {
  const fields: Record<string, string> = {
    bank_account_id: input.bankAccountId,
    period_from: input.periodFrom,
    period_to: input.periodTo,
    opening_balance: String(input.openingBalance),
    closing_balance: String(input.closingBalance),
  };
  const mapping = input.columnMapping;
  if (mapping?.headerRow != null) fields.header_row = String(mapping.headerRow);
  if (mapping?.dateCol != null) fields.date_col = String(mapping.dateCol);
  if (mapping?.descCol != null) fields.desc_col = String(mapping.descCol);
  if (mapping?.debitCol != null) fields.debit_col = String(mapping.debitCol);
  if (mapping?.creditCol != null) fields.credit_col = String(mapping.creditCol);
  if (mapping?.balanceCol != null) fields.balance_col = String(mapping.balanceCol);

  const row = await upload<ImportResponse>("/bank-statements/import", input.file, "file", 60_000, fields);
  return toImport(row);
}

async function listImports(bankAccountId?: string): Promise<BankStatementImport[]> {
  const page = await getList<ImportResponse>("/bank-statements", {
    filters: bankAccountId ? [{ field: "bank_account_id", operator: "eq", value: bankAccountId }] : undefined,
    pageSize: 100,
    sort: [{ field: "period_to", direction: "desc" }],
  });
  return page.items.map(toImport);
}

async function getImport(id: string): Promise<BankStatementImport> {
  return toImport(await getOne<ImportResponse>(`/bank-statements/${id}`));
}

async function autoMatch(id: string): Promise<AutoMatchResult> {
  const row = await send<{ matched: number; posted: number; still_unmatched: number }>(
    "post",
    `/bank-statements/${id}/auto-match`,
  );
  return { matched: row.matched, posted: row.posted, stillUnmatched: row.still_unmatched };
}

async function classifyLine(input: ClassifyLineInput): Promise<BankStatementLine> {
  const row = await send<LineResponse>("post", `/bank-statements/lines/${input.lineId}/classify`, {
    account_id: input.accountId,
    match_source_type: input.matchSourceType,
    match_source_id: input.matchSourceId,
    ignore: input.ignore,
  });
  return toLine(row);
}

async function getReconciliation(bankAccountId: string, asOf: string): Promise<Reconciliation> {
  const params = new URLSearchParams({ bank_account_id: bankAccountId, as_of: asOf });
  const row = await getOne<{
    bank_account_id: string;
    as_of: string;
    statement_balance: number | null;
    ledger_balance: number;
    difference: number | null;
    unmatched_count: number;
  }>(`/bank-statements/reconciliation?${params}`);
  return {
    bankAccountId: row.bank_account_id,
    asOf: row.as_of,
    statementBalance: row.statement_balance ?? undefined,
    ledgerBalance: row.ledger_balance,
    difference: row.difference ?? undefined,
    unmatchedCount: row.unmatched_count,
  };
}

async function listRules(): Promise<BankStatementRule[]> {
  const page = await getList<RuleResponse>("/bank-statement-rules", {
    pageSize: 100,
    sort: [{ field: "sort_order" }],
  });
  return page.items.map(toRule);
}

async function createRule(input: CreateRuleInput): Promise<BankStatementRule> {
  const row = await send<RuleResponse>("post", "/bank-statement-rules", {
    pattern: input.pattern,
    direction: input.direction,
    account_id: input.accountId,
    sort_order: input.sortOrder ?? 0,
  });
  return toRule(row);
}

async function updateRule(input: UpdateRuleInput): Promise<BankStatementRule> {
  const row = await send<RuleResponse>("put", `/bank-statement-rules/${input.id}`, {
    version: input.version,
    pattern: input.pattern,
    direction: input.direction,
    account_id: input.accountId,
    sort_order: input.sortOrder,
    is_active: input.isActive,
  });
  return toRule(row);
}

export const bankStatementApiHttp: BankStatementApi = {
  importStatement,
  listImports,
  getImport,
  autoMatch,
  classifyLine,
  getReconciliation,
  listRules,
  createRule,
  updateRule,
};
