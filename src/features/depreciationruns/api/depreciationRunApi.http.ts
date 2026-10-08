/**
 * Monthly depreciation runs, against the real API.
 *
 * ListRuns deliberately never carries `lines`/`total_amount` -- the same
 * N+1-avoidance reasoning invoice.ListInvoices and journal.ListJournals
 * give their own list reads (see financeApi.http.ts's own getJournals,
 * fixed for exactly this after a live "0 entri" bug in gap-closing plan
 * Phase C). listRuns fetches each row's own detail up front instead of
 * repeating that mistake -- a depreciation run list is at most one row per
 * month ever posted, nowhere near journals' own volume.
 */
import { getList, getOne, send } from "@/lib/api";
import type { DepreciationRunApi, DepreciationRunStatus, DepreciationRunView } from "./contract";

interface RunLineResponse {
  asset_id: string;
  asset_code: string;
  asset_name: string;
  amount: number;
}

interface RunResponse {
  id: string;
  period: string;
  status: DepreciationRunStatus;
  total_amount: number;
  lines: RunLineResponse[];
  version: number;
  created_at: string;
}

function toView(row: RunResponse): DepreciationRunView {
  return {
    id: row.id,
    period: row.period,
    status: row.status,
    totalAmount: row.total_amount,
    lines: (row.lines ?? []).map((l) => ({
      assetId: l.asset_id, assetCode: l.asset_code, assetName: l.asset_name, amount: l.amount,
    })),
    version: row.version,
    createdAt: row.created_at,
  };
}

async function listRuns(): Promise<DepreciationRunView[]> {
  const page = await getList<RunResponse>("/depreciation-runs", {
    pageSize: 100,
    sort: [{ field: "period", direction: "desc" }],
  });
  const withLines = await Promise.all(
    page.items.map((item) => getOne<RunResponse>(`/depreciation-runs/${item.id}`)),
  );
  return withLines.map(toView);
}

async function getRun(id: string): Promise<DepreciationRunView> {
  return toView(await getOne<RunResponse>(`/depreciation-runs/${id}`));
}

async function createRun(period: string): Promise<DepreciationRunView> {
  return toView(await send<RunResponse>("post", "/depreciation-runs", { period }));
}

async function voidRun(id: string, version: number): Promise<DepreciationRunView> {
  return toView(await send<RunResponse>("post", `/depreciation-runs/${id}/void`, { version }));
}

export const depreciationRunApiHttp: DepreciationRunApi = {
  listRuns,
  getRun,
  createRun,
  voidRun,
};
