/**
 * Generated financial statements, against the real API.
 *
 * Every field here is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/financialstatement response shapes
 * (financial-statements plan, phase P2) -- there is no adaptation logic
 * because the backend response was designed to match what this feature
 * already needed.
 */
import { apiClient, getOne } from "@/lib/api";
import type {
  BalanceSheetStatement,
  FinancialStatementsApi,
  GeneralLedgerPage,
  NotesStatement,
  ProfitAndLossStatement,
  StatementLine,
  StatementLineKind,
  StatementWarning,
} from "./contract";

interface LineResponse {
  code: string;
  label: string;
  kind: StatementLineKind;
  parent_code: string | null;
  level: number;
  is_bold: boolean;
  note_number: number | null;
  amount: number;
  ratio: number | null;
  accounts?: { account_id: string; code: string; name: string; amount: number }[];
}

interface WarningResponse {
  code: StatementWarning["code"];
  message: string;
  account_code?: string;
  amount?: number;
}

interface StatementResponse {
  layout: { code: string; name: string };
  period: { from?: string; to?: string; as_of?: string };
  company: { legal_name: string };
  lines: LineResponse[];
  balanced: boolean;
  warnings: WarningResponse[] | null;
}

function toLine(row: LineResponse): StatementLine {
  return {
    code: row.code,
    label: row.label,
    kind: row.kind,
    parentCode: row.parent_code,
    level: row.level,
    isBold: row.is_bold,
    noteNumber: row.note_number,
    amount: row.amount,
    ratio: row.ratio,
    accounts: (row.accounts ?? []).map((a) => ({ accountId: a.account_id, code: a.code, name: a.name, amount: a.amount })),
  };
}

function toWarning(row: WarningResponse): StatementWarning {
  return { code: row.code, message: row.message, accountCode: row.account_code, amount: row.amount };
}

function toStatement(row: StatementResponse): ProfitAndLossStatement {
  return {
    layout: row.layout,
    period: { from: row.period.from, to: row.period.to, asOf: row.period.as_of },
    company: { legalName: row.company.legal_name },
    lines: row.lines.map(toLine),
    balanced: row.balanced,
    warnings: (row.warnings ?? []).map(toWarning),
  };
}

async function getProfitAndLoss(input: { from: string; to: string; layout?: string; branchId?: string }): Promise<ProfitAndLossStatement> {
  const params = new URLSearchParams({ date_from: input.from, date_to: input.to });
  if (input.layout) params.set("layout", input.layout);
  if (input.branchId) params.set("branch_id", input.branchId);
  return toStatement(await getOne<StatementResponse>(`/financial-statements/profit-and-loss?${params}`));
}

async function getBalanceSheet(input: { asOf: string; layout?: string; branchId?: string }): Promise<BalanceSheetStatement> {
  const params = new URLSearchParams({ as_of: input.asOf });
  if (input.layout) params.set("layout", input.layout);
  if (input.branchId) params.set("branch_id", input.branchId);
  return toStatement(await getOne<StatementResponse>(`/financial-statements/balance-sheet?${params}`));
}

interface NoteResponse {
  note_number: number;
  line_code: string;
  label: string;
  total: number;
  leaves?: { code: string; name: string; amount: number }[];
}

interface NotesResponse {
  as_of: string;
  company: { legal_name: string };
  notes: NoteResponse[] | null;
}

async function getBalanceSheetNotes(input: { asOf: string; layout?: string }): Promise<NotesStatement> {
  const params = new URLSearchParams({ as_of: input.asOf });
  if (input.layout) params.set("layout", input.layout);
  const row = await getOne<NotesResponse>(`/financial-statements/balance-sheet-notes?${params}`);
  return {
    asOf: row.as_of,
    company: { legalName: row.company.legal_name },
    notes: (row.notes ?? []).map((n) => ({
      noteNumber: n.note_number,
      lineCode: n.line_code,
      label: n.label,
      total: n.total,
      leaves: n.leaves ?? [],
    })),
  };
}

interface GeneralLedgerLineResponse {
  journal_id: string;
  journal_number: string;
  account_code: string;
  date: string;
  description: string;
  source_type: string;
  debit: number;
  credit: number;
  balance: number;
}

interface GeneralLedgerResponse {
  account_code: string;
  account_name: string;
  from: string;
  to: string;
  opening_balance: number;
  lines: GeneralLedgerLineResponse[] | null;
  total: number;
  limit: number;
  offset: number;
}

async function getGeneralLedger(input: {
  accountId: string;
  from: string;
  to: string;
  limit?: number;
  offset?: number;
}): Promise<GeneralLedgerPage> {
  const params = new URLSearchParams({ account_id: input.accountId, date_from: input.from, date_to: input.to });
  if (input.limit) params.set("limit", String(input.limit));
  if (input.offset) params.set("offset", String(input.offset));
  const row = await getOne<GeneralLedgerResponse>(`/financial-statements/general-ledger?${params}`);
  return {
    accountCode: row.account_code,
    accountName: row.account_name,
    from: row.from,
    to: row.to,
    openingBalance: row.opening_balance,
    lines: (row.lines ?? []).map((l) => ({
      journalId: l.journal_id,
      journalNumber: l.journal_number,
      accountCode: l.account_code,
      date: l.date,
      description: l.description,
      sourceType: l.source_type,
      debit: l.debit,
      credit: l.credit,
      balance: l.balance,
    })),
    total: row.total,
    limit: row.limit,
    offset: row.offset,
  };
}

/** Triggers a browser download of the .xlsx the backend renders --
 *  `responseType: "blob"` is what keeps axios from trying to parse binary
 *  content as the JSON envelope every other endpoint returns. */
async function downloadPackage(input: {
  fiscalYear?: number;
  dateFrom?: string;
  dateTo?: string;
  asOf?: string;
  branchId?: string;
}): Promise<void> {
  const params = new URLSearchParams();
  if (input.fiscalYear) params.set("fiscal_year", String(input.fiscalYear));
  if (input.dateFrom) params.set("date_from", input.dateFrom);
  if (input.dateTo) params.set("date_to", input.dateTo);
  if (input.asOf) params.set("as_of", input.asOf);
  if (input.branchId) params.set("branch_id", input.branchId);

  const response = await apiClient.get(`/financial-statements/export?${params}`, { responseType: "blob" });
  const disposition: string = response.headers["content-disposition"] ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "Laporan_Keuangan.xlsx";

  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const financialstatementsApiHttp: FinancialStatementsApi = {
  getProfitAndLoss,
  getBalanceSheet,
  getBalanceSheetNotes,
  getGeneralLedger,
  downloadPackage,
};
