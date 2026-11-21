import { getOne, send } from "@/lib/api";
import type { AdjustmentState, PlanLink, Sim3lonAdjustment, Sim3lonAdjustmentApi } from "./sim3lonAdjustment.contract";

interface PlanRefResponse {
  id: string;
  order_number: string;
  order_status?: string;
  total_qty?: number;
}

interface AdjustmentResponse {
  plan_id: string;
  plan_number: string;
  operational_date: string;
  state: AdjustmentState;
  message?: string;
  applied_at?: string;
  sim3lon_qty: number;
  committed_qty: number;
  add_qty: number;
  reduce_qty: number;
  over_qty: number;
  rows: {
    outlet_id: string;
    outlet_code: string;
    outlet_name: string;
    sim3lon_qty: number;
    committed_qty: number;
    sent_qty: number;
    add_qty: number;
    reduce_qty: number;
    over_qty: number;
  }[];
  draft_topup?: PlanRefResponse;
  fingerprint: string;
  topup?: PlanRefResponse;
}

const STATES: AdjustmentState[] = ["in_sync", "adjustable", "over_only", "draft", "past"];

function link(ref?: PlanRefResponse): PlanLink | undefined {
  return ref ? { id: ref.id, kode: ref.order_number, status: ref.order_status, totalUnit: ref.total_qty } : undefined;
}

function toAdjustment(response: AdjustmentResponse): Sim3lonAdjustment {
  // A comparison the screen cannot read must not offer a button that
  // changes the day.
  if (!STATES.includes(response.state) || !Array.isArray(response.rows) || !/^[0-9a-f]{64}$/.test(response.fingerprint)) {
    throw new Error("Perbandingan dengan SIM3LON tidak bisa dibaca. Muat ulang halaman, lalu coba lagi.");
  }
  return {
    planId: response.plan_id,
    planKode: response.plan_number,
    tanggal: response.operational_date,
    state: response.state,
    message: response.message,
    appliedAt: response.applied_at,
    sim3lon: response.sim3lon_qty,
    committed: response.committed_qty,
    add: response.add_qty,
    reduce: response.reduce_qty,
    over: response.over_qty,
    rows: response.rows.map((row) => ({
      outletId: row.outlet_id,
      outletCode: row.outlet_code,
      outletName: row.outlet_name,
      sim3lon: row.sim3lon_qty,
      committed: row.committed_qty,
      sent: row.sent_qty,
      add: row.add_qty,
      reduce: row.reduce_qty,
      over: row.over_qty,
    })),
    draftTopup: link(response.draft_topup),
    fingerprint: response.fingerprint,
    topup: link(response.topup),
  };
}

export const sim3lonAdjustmentHttp: Sim3lonAdjustmentApi = {
  async getAdjustment(planId) {
    return toAdjustment(await getOne<AdjustmentResponse>(`/distribution/orders/${planId}/sim3lon-adjustment`));
  },
  async applyAdjustment(planId, fingerprint) {
    return toAdjustment(await send<AdjustmentResponse>("post", `/distribution/orders/${planId}/sim3lon-adjustment`, { fingerprint }));
  },
};
