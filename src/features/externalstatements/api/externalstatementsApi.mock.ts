/**
 * Imported comparison books, against the mock database.
 *
 * Scope decision (financial-statements plan's gap-closing phase, Phase
 * A.3): the project has no xlsx-PARSING library -- `src/lib/export.ts`
 * only ever writes files, and nothing here can read the binary workbook
 * a `<input type="file">` hands back. Rather than add a new dependency
 * for a mock-only convenience, importStatement in this build does not
 * read the uploaded file's content at all: it creates the statement with
 * every layout line recomputed from zero (the same evaluateImported this
 * package's own lib/evaluate.ts ports from the backend, just fed an empty
 * raw list), and a developer types real test figures through the same
 * line-correction table the UI already needs for a hand correction
 * (updateLines) -- pure JS, no file parsing, and just as faithful to the
 * real recompute rules.
 *
 * Storage is a small module-level array, not the shared mock Database:
 * an imported book is not a ledger document the rest of the mock
 * (invoices, payments, ledger lines) ever needs to see, so giving it its
 * own table in `types.ts`/`db.ts` would be structure for no reader.
 * Tenant-scoped by actingTenantId only (no branch concept for a
 * statement), which is enough to keep two tenants in the same demo from
 * seeing each other's imports.
 */
import { getActiveScope } from "@/mocks/scope";
import { ApiError, latency } from "@/mocks/db";
import { defaultLayout, layoutByCode } from "@/features/financialstatements/lib/layouts";
import { evaluateImported } from "../lib/evaluate";
import type {
  ExternalStatement,
  ExternalStatementsApi,
  ImportStatementInput,
  StatementKind,
  StatementNote,
  UpdateLinesInput,
  UpsertNoteInput,
} from "./contract";

interface MockStatement extends ExternalStatement {
  tenantId: string;
}

let statements: MockStatement[] = [];
let nextId = 1;
const notes = new Map<string, StatementNote>();

function noteKey(n: Pick<StatementNote, "layoutLineCode" | "scopeKey" | "externalStatementId">): string {
  return `${n.layoutLineCode}::${n.scopeKey}::${n.externalStatementId ?? ""}`;
}

async function getTemplate(): Promise<void> {
  await latency("read");
  // Nothing to download in mock mode -- there is no file to produce
  // without the xlsx library this build does not have. The import dialog
  // explains this and lets the user import a statement anyway (see the
  // scope note above); a real template is only ever a real backend concern.
}

async function importStatement(input: ImportStatementInput): Promise<ExternalStatement> {
  await latency("upload");
  const layout = (input.layoutCode && layoutByCode(input.layoutCode)) || defaultLayout(input.kind);
  const lines = evaluateImported(layout, []);
  const now = new Date().toISOString();
  const row: MockStatement = {
    id: `ext-${nextId++}`,
    tenantId: getActiveScope().actingTenantId,
    label: input.label,
    kind: input.kind,
    layoutCode: layout.code,
    periodFrom: input.periodFrom ?? null,
    periodTo: input.periodTo ?? null,
    asOf: input.asOf ?? null,
    sourceFileName: input.file.name,
    notes: null,
    lines,
    version: 1,
    createdAt: now,
    updatedAt: now,
  };
  statements.push(row);
  return row;
}

async function listStatements(kind?: StatementKind): Promise<ExternalStatement[]> {
  await latency("read");
  const tenantId = getActiveScope().actingTenantId;
  return statements.filter((s) => s.tenantId === tenantId && (!kind || s.kind === kind));
}

function find(id: string): MockStatement {
  const row = statements.find((s) => s.id === id && s.tenantId === getActiveScope().actingTenantId);
  if (!row) throw new ApiError("Laporan pembanding tidak ditemukan.", 404);
  return row;
}

async function getStatement(id: string): Promise<ExternalStatement> {
  await latency("read");
  return find(id);
}

async function updateLines(input: UpdateLinesInput): Promise<ExternalStatement> {
  await latency("write");
  const row = find(input.id);
  if (row.version !== input.version) {
    throw new ApiError("Versi tidak sesuai -- data telah diubah di tempat lain.", 409);
  }
  const layout = layoutByCode(row.layoutCode) ?? defaultLayout(row.kind);
  row.lines = evaluateImported(layout, input.lines);
  row.version += 1;
  row.updatedAt = new Date().toISOString();
  return row;
}

async function deleteStatement(id: string): Promise<void> {
  await latency("write");
  find(id); // 404s if missing/wrong tenant before mutating
  statements = statements.filter((s) => s.id !== id);
}

async function upsertNote(input: UpsertNoteInput): Promise<StatementNote> {
  await latency("write");
  const key = noteKey(input);
  const existing = notes.get(key);
  const row: StatementNote = {
    layoutLineCode: input.layoutLineCode,
    scopeKey: input.scopeKey,
    externalStatementId: input.externalStatementId,
    note: input.note,
    version: (existing?.version ?? 0) + 1,
  };
  notes.set(key, row);
  return row;
}

export const externalstatementsApiMock: ExternalStatementsApi = {
  getTemplate,
  importStatement,
  listStatements,
  getStatement,
  updateLines,
  deleteStatement,
  upsertNote,
};

/** Read-only lookup financialstatementsApi.mock.ts uses to merge an
 *  external compare onto a computed Statement/NotesStatement -- kept
 *  here rather than exported as mutable state, the same boundary the
 *  http adapter has for free (it can only ever read via the API). */
export function findExternalStatementForCompare(id: string): ExternalStatement | undefined {
  return statements.find((s) => s.id === id && s.tenantId === getActiveScope().actingTenantId);
}

/** Read-only lookup for a note, by the same (layoutLineCode, scopeKey,
 *  externalStatementId) key Upsert writes under. */
export function findNoteForCompare(layoutLineCode: string, scopeKey: string, externalStatementId?: string): string | undefined {
  return notes.get(noteKey({ layoutLineCode, scopeKey, externalStatementId }))?.note;
}
