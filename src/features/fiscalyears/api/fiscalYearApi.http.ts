/**
 * Fiscal-year close/reopen, against the real API.
 *
 * ListFiscalYears is a plain array under `data`, not a paginated list --
 * mirrors the real usecase's own []*FiscalYearResponse return, so this
 * goes through `getOne`, not `getList`.
 */
import { getOne, send } from "@/lib/api";
import type { FiscalYearApi, FiscalYearStatus, FiscalYearView } from "./contract";

interface FiscalYearResponse {
  year: number;
  status: FiscalYearStatus;
  closed_at?: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function toView(row: FiscalYearResponse): FiscalYearView {
  return {
    year: row.year,
    status: row.status,
    closedAt: row.closed_at,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listFiscalYears(): Promise<FiscalYearView[]> {
  const rows = await getOne<FiscalYearResponse[]>("/fiscal-years");
  return rows.map(toView);
}

async function closeFiscalYear(year: number): Promise<FiscalYearView> {
  return toView(await send<FiscalYearResponse>("post", `/fiscal-years/${year}/close`, {}));
}

async function reopenFiscalYear(year: number, version: number): Promise<FiscalYearView> {
  return toView(await send<FiscalYearResponse>("post", `/fiscal-years/${year}/reopen`, { version }));
}

export const fiscalYearApiHttp: FiscalYearApi = {
  listFiscalYears,
  closeFiscalYear,
  reopenFiscalYear,
};
