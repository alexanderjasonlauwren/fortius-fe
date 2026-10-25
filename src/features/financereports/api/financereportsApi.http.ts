/**
 * The report pack, against the real API: GET /reports, /reports/:key and
 * /reports/:key/export (fortius-backend accounting parity P5).
 */
import { apiClient, getOne } from "@/lib/api";
import type {
  FinanceReportsApi,
  Report,
  ReportColumn,
  ReportDefinition,
  ReportLink,
  ReportQuery,
  ReportRow,
} from "./contract";

interface DefinitionResponse {
  key: string;
  title: string;
  category: ReportDefinition["category"];
  description: string;
  period_kind: ReportDefinition["periodKind"];
  branched: boolean;
  params?: string[] | null;
}

interface ReportResponse {
  key: string;
  title: string;
  period: { from?: string; to?: string; as_of?: string };
  company: { legal_name: string };
  columns: ReportColumn[];
  rows: { kind: ReportRow["kind"]; level: number; cells: ReportRow["cells"]; link?: ReportLink }[] | null;
  checks: ReportResponseCheck[] | null;
  notes?: string[] | null;
}

interface ReportResponseCheck {
  label: string;
  expected: number;
  actual: number;
  ok: boolean;
}

/** The server sends a period bound as an RFC 3339 midnight; the console
 *  works in YYYY-MM-DD, the form every date input and formatDateId takes. */
function day(value?: string): string | undefined {
  return value ? value.slice(0, 10) : undefined;
}

/** A range report takes date_from/date_to, an as-of report as_of; the
 *  server refuses the wrong pair, so only what the query carries is sent. */
function params(query: ReportQuery): URLSearchParams {
  const p = new URLSearchParams();
  if (query.asOf) p.set("as_of", query.asOf);
  if (query.from) p.set("date_from", query.from);
  if (query.to) p.set("date_to", query.to);
  if (query.branchId) p.set("branch_id", query.branchId);
  if (query.productId) p.set("product_id", query.productId);
  return p;
}

async function getCatalogue(): Promise<ReportDefinition[]> {
  const rows = await getOne<DefinitionResponse[]>("/reports");
  return (rows ?? []).map((r) => ({
    key: r.key,
    title: r.title,
    category: r.category,
    description: r.description,
    periodKind: r.period_kind,
    branched: r.branched,
    params: r.params ?? [],
  }));
}

async function getReport(key: string, query: ReportQuery): Promise<Report> {
  const r = await getOne<ReportResponse>(`/reports/${encodeURIComponent(key)}?${params(query)}`);
  return {
    key: r.key,
    title: r.title,
    period: { from: day(r.period.from), to: day(r.period.to), asOf: day(r.period.as_of) },
    company: { legalName: r.company.legal_name },
    columns: r.columns,
    rows: (r.rows ?? []).map((row) => ({ kind: row.kind, level: row.level, cells: row.cells, link: row.link ?? undefined })),
    checks: r.checks ?? [],
    notes: r.notes ?? [],
  };
}

/** The workbook the server renders; `responseType: "blob"` keeps axios from
 *  parsing it as the JSON envelope. */
async function downloadReport(key: string, query: ReportQuery): Promise<void> {
  const response = await apiClient.get(`/reports/${encodeURIComponent(key)}/export?${params(query)}`, {
    responseType: "blob",
  });
  const disposition: string = response.headers["content-disposition"] ?? "";
  const filename = /filename="?([^"]+)"?/.exec(disposition)?.[1] ?? `${key}.xlsx`;

  const url = URL.createObjectURL(response.data as Blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export const financereportsApiHttp: FinanceReportsApi = { getCatalogue, getReport, downloadReport };
