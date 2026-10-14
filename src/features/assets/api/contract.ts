/**
 * What every asset-register adapter must provide.
 *
 * Mirrors fortius-backend's internal/entities/asset package: the fixed-
 * asset / intangible / prepaid register (financial-statements plan P6).
 * Gap-closing plan, Phase D.
 */
import type { AssetClass, AssetStatus } from "@/types/domain";

export type { AssetClass, AssetStatus };

export interface AssetView {
  id: string;
  assetCode: string;
  name: string;
  assetClass: AssetClass;
  acquisitionDate: string;
  depreciationStartDate: string;
  cost: number;
  residualValue: number;
  usefulLifeMonths: number;
  method: "straight_line";
  openingAccumulated: number;
  openingAsOf?: string;

  assetAccountId: string;
  assetAccountCode: string;
  accumulatedAccountId?: string;
  accumulatedAccountCode?: string;
  expenseAccountId: string;
  expenseAccountCode: string;
  vehicleId?: string;

  status: AssetStatus;
  disposedAt?: string;
  /** Numbers of the journals that bought and sold it, and what it fetched. */
  acquisitionJournal?: string;
  disposalJournal?: string;
  disposalProceeds?: number;

  /** (cost-residual)/useful_life_months -- computed on read, never stored. */
  monthlyAmount: number;
  /** openingAccumulated plus every posted run's own line for this asset,
   *  as of now -- computed on read, never stored. */
  accumulatedToDate: number;

  version: number;
  createdAt: string;
  updatedAt: string;
}

/**
 * AssetAccountID/AccumulatedAccountID/ExpenseAccountID are all optional:
 * left out, each resolves to its asset_class's own default account. See
 * the real backend's own CreateAssetRequest doc -- AccumulatedAccountID
 * has no default for "prepaid", so leaving it unset there is the normal
 * case, not a missing value.
 */
export interface CreateAssetInput {
  assetCode: string;
  name: string;
  assetClass: AssetClass;
  acquisitionDate: string;
  depreciationStartDate: string;
  cost: number;
  residualValue?: number;
  usefulLifeMonths: number;
  openingAccumulated?: number;
  openingAsOf?: string;
  assetAccountId?: string;
  accumulatedAccountId?: string;
  expenseAccountId?: string;
  vehicleId?: string;
  /** "Dikreditkan dari": where it was paid from or owed to. Given, the
   *  backend posts the acquisition journal (Dr asset / Cr this account). */
  creditAccountId?: string;
}

/** Edits an asset's register fields -- never its class, code or account
 *  mapping, which is a correction made by re-registering the row. */
export interface UpdateAssetInput {
  id: string;
  version: number;
  name: string;
  residualValue: number;
  usefulLifeMonths: number;
  /** Disposing is disposeAsset, which posts the journal. */
  status: Exclude<AssetStatus, "disposed">;
}

/** Sells or writes off an asset; the backend posts the disposal journal. */
export interface DisposeAssetInput {
  id: string;
  version: number;
  disposedAt: string;
  /** Zero for a write-off. */
  proceeds: number;
  /** Where the proceeds went; required when proceeds is positive. */
  proceedsAccountId?: string;
  /** Overrides Pendapatan Lain-lain for the gain or loss. */
  gainLossAccountId?: string;
  note?: string;
}

export interface AssetScheduleLine {
  period: string; // "2026-01"
  amount: number;
  accumulatedAfter: number;
}

export interface AssetReconciliationRow {
  assetClass: AssetClass;
  registerCost: number;
  ledgerAssetBalance: number;
  costDifference: number;
  registerAccumulated: number;
  ledgerAccumulatedBalance: number;
  accumulatedDifference: number;
}

export interface AssetApi {
  listAssets(): Promise<AssetView[]>;
  getAsset(id: string): Promise<AssetView>;
  createAsset(input: CreateAssetInput): Promise<AssetView>;
  updateAsset(input: UpdateAssetInput): Promise<AssetView>;
  disposeAsset(input: DisposeAssetInput): Promise<AssetView>;
  getAssetSchedule(id: string): Promise<AssetScheduleLine[]>;
  getAssetReconciliation(asOf: string): Promise<AssetReconciliationRow[]>;
}
