/**
 * What every outlet-warning (Surat Peringatan) adapter must provide.
 *
 * D3 A-Step 3: a plain, append-only log of warning letters issued to an
 * outlet, per the client's own flow document (§9.1) naming SP history as
 * one of three outlet-performance indicators and saying outright it should
 * start as manual entry. Read+create only — no update or delete.
 */
import type { ID, OutletWarningEntity } from "@/types/domain";

export type OutletWarningView = OutletWarningEntity;

export interface CreateOutletWarningInput {
  outletId: ID;
  /** ISO date. Defaults to today when absent. */
  issuedOn?: string;
  reason: string;
  notes?: string;
}

export interface OutletWarningApi {
  getOutletWarnings(outletId: ID): Promise<OutletWarningView[]>;
  createOutletWarning(input: CreateOutletWarningInput): Promise<OutletWarningView>;
}
