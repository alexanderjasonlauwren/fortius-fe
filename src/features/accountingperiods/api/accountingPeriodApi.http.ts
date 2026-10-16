/**
 * The monthly period lock, against the real API: GET /accounting-periods and
 * PUT /accounting-periods/:period (fortius-backend accounting parity P7).
 */
import { getOne, send } from "@/lib/api";
import type { AccountingPeriod, AccountingPeriodApi, PeriodStatus } from "./contract";

interface PeriodResponse {
  period: string;
  status: PeriodStatus;
  year_closed: boolean;
  reason?: string;
  changed_at?: string;
  changed_by?: string;
  journals: number;
  version: number;
}

function toView(r: PeriodResponse): AccountingPeriod {
  return {
    period: r.period,
    status: r.status,
    yearClosed: r.year_closed,
    reason: r.reason,
    changedAt: r.changed_at,
    changedBy: r.changed_by,
    journals: r.journals,
    version: r.version,
  };
}

async function listYear(year: number): Promise<AccountingPeriod[]> {
  const rows = await getOne<PeriodResponse[]>(`/accounting-periods?year=${year}`);
  return (rows ?? []).map(toView);
}

async function setStatus(
  period: string,
  input: { status: PeriodStatus; version: number; reason?: string },
): Promise<AccountingPeriod> {
  const body: Record<string, unknown> = { status: input.status, version: input.version };
  if (input.reason) body.reason = input.reason;
  return toView(await send<PeriodResponse>("put", `/accounting-periods/${encodeURIComponent(period)}`, body));
}

export const accountingPeriodApiHttp: AccountingPeriodApi = { listYear, setStatus };
