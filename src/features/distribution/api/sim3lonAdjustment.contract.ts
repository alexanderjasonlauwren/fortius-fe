/**
 * "Tambah dari SIM3LON" / "Sesuaikan dengan SIM3LON": SIM3LON's figures for a
 * day whose plan has left draft, compared with everything the day's plans
 * hold, per pangkalan.
 *
 * - `adjustable`: something to add (onto a linked extra plan) or to take back
 *   from stops not yet sent.
 * - `over_only`: more already left than SIM3LON now shows; nothing to press,
 *   a person settles it.
 * - `in_sync`, `draft` (a draft follows SIM3LON on its own), `past`.
 */
export type AdjustmentState = "in_sync" | "adjustable" | "over_only" | "draft" | "past";

export interface AdjustmentRow {
  outletId: string;
  outletCode: string;
  outletName: string;
  sim3lon: number;
  committed: number;
  sent: number;
  add: number;
  reduce: number;
  over: number;
}

export interface PlanLink {
  id: string;
  kode: string;
  status?: string;
  totalUnit?: number;
}

export interface Sim3lonAdjustment {
  planId: string;
  planKode: string;
  tanggal: string;
  state: AdjustmentState;
  message?: string;
  appliedAt?: string;
  sim3lon: number;
  committed: number;
  add: number;
  reduce: number;
  over: number;
  rows: AdjustmentRow[];
  /** The open extra plan an increase goes onto, when there is one. */
  draftTopup?: PlanLink;
  fingerprint: string;
  /** After an apply: the extra plan the increase went on. */
  topup?: PlanLink;
}

export interface Sim3lonAdjustmentApi {
  getAdjustment(planId: string): Promise<Sim3lonAdjustment>;
  applyAdjustment(planId: string, fingerprint: string): Promise<Sim3lonAdjustment>;
}

/** The button's name says what pressing it does. */
export function adjustmentAction(adjustment: Sim3lonAdjustment): string {
  if (adjustment.add > 0 && adjustment.reduce > 0) return "Sesuaikan dengan SIM3LON";
  if (adjustment.add > 0) return "Tambah dari SIM3LON";
  return "Sesuaikan dengan SIM3LON";
}
