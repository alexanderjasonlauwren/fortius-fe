/**
 * Surat Peringatan history, against the real API.
 *
 * `GET /outlet-warnings` / `POST /outlet-warnings` — a new, deliberately
 * small backend module built alongside D3 A-Step 3's credit-limit dispatch
 * block: a plain append-only log, no update or delete.
 */
import { getAllPages, send } from "@/lib/api";
import type { CreateOutletWarningInput, OutletWarningApi, OutletWarningView } from "./contract";
import type { ID } from "@/types/domain";

const PAGE_SIZE = 100;

interface OutletWarningResponse {
  id: string;
  outlet_id: string;
  issued_on: string;
  reason: string;
  notes?: string;
  created_at: string;
}

function toView(row: OutletWarningResponse): OutletWarningView {
  return {
    id: row.id,
    tenantId: "",
    branchId: "",
    outletId: row.outlet_id,
    issuedOn: row.issued_on,
    reason: row.reason,
    notes: row.notes,
    createdAt: row.created_at,
  };
}

async function getOutletWarnings(outletId: ID): Promise<OutletWarningView[]> {
  const page = await getAllPages<OutletWarningResponse>("/outlet-warnings", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "issued_on", direction: "desc" }],
    filters: [{ field: "outlet_id", operator: "eq" as const, value: outletId }],
  });
  return page.items.map(toView);
}

async function createOutletWarning(input: CreateOutletWarningInput): Promise<OutletWarningView> {
  return toView(
    await send<OutletWarningResponse>("post", "/outlet-warnings", {
      outlet_id: input.outletId,
      issued_on: input.issuedOn,
      reason: input.reason,
      notes: input.notes,
    }),
  );
}

export const outletWarningApiHttp: OutletWarningApi = {
  getOutletWarnings,
  createOutletWarning,
};
