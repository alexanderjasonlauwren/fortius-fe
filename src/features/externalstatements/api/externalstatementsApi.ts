/**
 * The external-statements adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { externalstatementsApiMock } from "./externalstatementsApi.mock";
import { externalstatementsApiHttp } from "./externalstatementsApi.http";
import type { ExternalStatementsApi } from "./contract";

export type {
  ExternalStatement,
  ExternalStatementLine,
  ExternalStatementLineInput,
  ExternalStatementsApi,
  ImportStatementInput,
  StatementKind,
  StatementNote,
  UpdateLinesInput,
  UpsertNoteInput,
} from "./contract";

const api: ExternalStatementsApi = pick(externalstatementsApiMock, externalstatementsApiHttp);

export const getTemplate = api.getTemplate.bind(api);
export const importStatement = api.importStatement.bind(api);
export const listStatements = api.listStatements.bind(api);
export const getStatement = api.getStatement.bind(api);
export const updateLines = api.updateLines.bind(api);
export const deleteStatement = api.deleteStatement.bind(api);
export const upsertNote = api.upsertNote.bind(api);
