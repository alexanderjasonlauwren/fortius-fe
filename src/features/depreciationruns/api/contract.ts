/**
 * What every depreciation-run adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/depreciationrun package:
 * one monthly run across every active asset, posted in the same write it
 * is computed in -- there is no draft state (financial-statements plan
 * P6). Gap-closing plan, Phase D.
 */
import type { DepreciationRunStatus } from "@/types/domain";

export type { DepreciationRunStatus };

export interface DepreciationRunLineView {
  assetId: string;
  assetCode: string;
  assetName: string;
  amount: number;
}

export interface DepreciationRunView {
  id: string;
  period: string; // "2026-01"
  status: DepreciationRunStatus;
  totalAmount: number;
  lines: DepreciationRunLineView[];
  version: number;
  createdAt: string;
}

export interface DepreciationRunApi {
  listRuns(): Promise<DepreciationRunView[]>;
  getRun(id: string): Promise<DepreciationRunView>;
  /** Period is "YYYY-MM". Posting computes the lines and writes the
   *  journal in the same call -- see this file's own header. */
  createRun(period: string): Promise<DepreciationRunView>;
  /** Only the latest posted run may be voided. */
  voidRun(id: string, version: number): Promise<DepreciationRunView>;
}
