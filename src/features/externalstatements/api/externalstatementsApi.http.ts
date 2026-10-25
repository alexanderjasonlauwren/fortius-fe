/**
 * Imported comparison books, against the real API.
 *
 * Every field is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/externalstatement response shapes.
 */
import { apiClient, getList, getOne, send, upload } from "@/lib/api";
import type {
  ExternalStatement,
  ExternalStatementLine,
  ExternalStatementsApi,
  ImportStatementInput,
  StatementKind,
  StatementNote,
  UpdateLinesInput,
  UpsertNoteInput,
} from "./contract";

interface LineResponse {
  line_code: string | null;
  parent_line_code: string | null;
  account_code: string | null;
  label: string;
  amount: number;
  sort_order: number;
}

interface StatementResponse {
  id: string;
  label: string;
  kind: StatementKind;
  layout_code: string;
  period_from?: string;
  period_to?: string;
  as_of?: string;
  source_file_name?: string;
  notes?: string;
  lines: LineResponse[];
  version: number;
  created_at: string;
  updated_at: string;
}

function toLine(row: LineResponse): ExternalStatementLine {
  return {
    lineCode: row.line_code,
    parentLineCode: row.parent_line_code,
    accountCode: row.account_code,
    label: row.label,
    amount: row.amount,
    sortOrder: row.sort_order,
  };
}

function toStatement(row: StatementResponse): ExternalStatement {
  return {
    id: row.id,
    label: row.label,
    kind: row.kind,
    layoutCode: row.layout_code,
    periodFrom: row.period_from ?? null,
    periodTo: row.period_to ?? null,
    asOf: row.as_of ?? null,
    sourceFileName: row.source_file_name ?? null,
    notes: row.notes ?? null,
    lines: (row.lines ?? []).map(toLine),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Same blob-download technique downloadPackage (financialstatements)
 *  already uses -- the filename comes off Content-Disposition. */
async function getTemplate(kind: StatementKind, layoutCode?: string): Promise<void> {
  const params = new URLSearchParams({ kind });
  if (layoutCode) params.set("layout_code", layoutCode);
  const response = await apiClient.get(`/external-statements/template?${params}`, { responseType: "blob" });
  const disposition: string = response.headers["content-disposition"] ?? "";
  const match = /filename="?([^"]+)"?/.exec(disposition);
  const filename = match?.[1] ?? "Template_Laporan.xlsx";

  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

async function importStatement(input: ImportStatementInput): Promise<ExternalStatement> {
  const fields: Record<string, string> = { label: input.label, kind: input.kind };
  if (input.layoutCode) fields.layout_code = input.layoutCode;
  if (input.periodFrom) fields.period_from = input.periodFrom;
  if (input.periodTo) fields.period_to = input.periodTo;
  if (input.asOf) fields.as_of = input.asOf;
  const row = await upload<StatementResponse>("/external-statements", input.file, "file", 60_000, fields);
  return toStatement(row);
}

async function listStatements(kind?: StatementKind): Promise<ExternalStatement[]> {
  const page = await getList<StatementResponse>("/external-statements", {
    filters: kind ? [{ field: "kind", operator: "eq", value: kind }] : undefined,
    pageSize: 100,
  });
  return page.items.map(toStatement);
}

async function getStatement(id: string): Promise<ExternalStatement> {
  return toStatement(await getOne<StatementResponse>(`/external-statements/${id}`));
}

async function updateLines(input: UpdateLinesInput): Promise<ExternalStatement> {
  const row = await send<StatementResponse>("put", `/external-statements/${input.id}/lines`, {
    version: input.version,
    lines: input.lines.map((l) => ({
      line_code: l.lineCode,
      parent_line_code: l.parentLineCode,
      account_code: l.accountCode,
      label: l.label,
      amount: l.amount,
      sort_order: l.sortOrder,
    })),
  });
  return toStatement(row);
}

async function deleteStatement(id: string): Promise<void> {
  await send<null>("delete", `/external-statements/${id}`);
}

interface NoteResponse {
  layout_line_code: string;
  scope_key: string;
  external_statement_id?: string;
  note: string;
  version: number;
}

async function upsertNote(input: UpsertNoteInput): Promise<StatementNote> {
  const row = await send<NoteResponse>("put", "/statement-notes", {
    layout_line_code: input.layoutLineCode,
    scope_key: input.scopeKey,
    external_statement_id: input.externalStatementId,
    note: input.note,
  });
  return {
    layoutLineCode: row.layout_line_code,
    scopeKey: row.scope_key,
    externalStatementId: row.external_statement_id,
    note: row.note,
    version: row.version,
  };
}

export const externalstatementsApiHttp: ExternalStatementsApi = {
  getTemplate,
  importStatement,
  listStatements,
  getStatement,
  updateLines,
  deleteStatement,
  upsertNote,
};
