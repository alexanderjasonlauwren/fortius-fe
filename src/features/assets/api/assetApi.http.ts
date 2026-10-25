/**
 * The asset register, against the real API.
 *
 * Every field is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/asset response shapes. Unlike
 * registrationpackages' own ListPackages, ListAssets calls the same
 * toResponse every single-row read does -- monthlyAmount/accumulatedToDate
 * are real on every row of the list, not just the detail read.
 */
import { getList, getOne, send } from "@/lib/api";
import type {
  AssetApi,
  AssetClass,
  AssetReconciliationRow,
  AssetScheduleLine,
  AssetStatus,
  AssetView,
  CreateAssetInput,
  DisposeAssetInput,
  UpdateAssetInput,
} from "./contract";

interface AssetResponse {
  id: string;
  asset_code: string;
  name: string;
  asset_class: AssetClass;
  acquisition_date: string;
  depreciation_start_date: string;
  cost: number;
  residual_value: number;
  useful_life_months: number;
  method: "straight_line";
  opening_accumulated: number;
  opening_as_of?: string;

  asset_account_id: string;
  asset_account_code: string;
  accumulated_account_id?: string;
  accumulated_account_code?: string;
  expense_account_id: string;
  expense_account_code: string;
  vehicle_id?: string;

  status: AssetStatus;
  disposed_at?: string;
  acquisition_journal?: string;
  disposal_journal?: string;
  disposal_proceeds?: number;

  monthly_amount: number;
  accumulated_to_date: number;

  version: number;
  created_at: string;
  updated_at: string;
}

interface ScheduleResponse {
  asset_id: string;
  lines: { period: string; amount: number; accumulated_after: number }[];
}

interface ReconciliationResponse {
  as_of: string;
  rows: {
    asset_class: AssetClass;
    asset_classes?: AssetClass[];
    ledger_accounts?: string[];
    register_cost: number;
    ledger_asset_balance: number;
    cost_difference: number;
    register_accumulated: number;
    ledger_accumulated_balance: number;
    accumulated_difference: number;
  }[];
}

function toView(row: AssetResponse): AssetView {
  return {
    id: row.id,
    assetCode: row.asset_code,
    name: row.name,
    assetClass: row.asset_class,
    acquisitionDate: row.acquisition_date,
    depreciationStartDate: row.depreciation_start_date,
    cost: row.cost,
    residualValue: row.residual_value,
    usefulLifeMonths: row.useful_life_months,
    method: row.method,
    openingAccumulated: row.opening_accumulated,
    openingAsOf: row.opening_as_of,
    assetAccountId: row.asset_account_id,
    assetAccountCode: row.asset_account_code,
    accumulatedAccountId: row.accumulated_account_id,
    accumulatedAccountCode: row.accumulated_account_code,
    expenseAccountId: row.expense_account_id,
    expenseAccountCode: row.expense_account_code,
    vehicleId: row.vehicle_id,
    status: row.status,
    disposedAt: row.disposed_at,
    acquisitionJournal: row.acquisition_journal,
    disposalJournal: row.disposal_journal,
    disposalProceeds: row.disposal_proceeds,
    monthlyAmount: row.monthly_amount,
    accumulatedToDate: row.accumulated_to_date,
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function listAssets(): Promise<AssetView[]> {
  const page = await getList<AssetResponse>("/assets", {
    pageSize: 100,
    sort: [{ field: "asset_code" }],
  });
  return page.items.map(toView);
}

async function getAsset(id: string): Promise<AssetView> {
  return toView(await getOne<AssetResponse>(`/assets/${id}`));
}

async function createAsset(input: CreateAssetInput): Promise<AssetView> {
  const row = await send<AssetResponse>("post", "/assets", {
    asset_code: input.assetCode,
    name: input.name,
    asset_class: input.assetClass,
    acquisition_date: input.acquisitionDate,
    depreciation_start_date: input.depreciationStartDate,
    cost: input.cost,
    residual_value: input.residualValue,
    useful_life_months: input.usefulLifeMonths,
    opening_accumulated: input.openingAccumulated,
    opening_as_of: input.openingAsOf,
    asset_account_id: input.assetAccountId,
    accumulated_account_id: input.accumulatedAccountId,
    expense_account_id: input.expenseAccountId,
    vehicle_id: input.vehicleId,
    credit_account_id: input.creditAccountId || undefined,
  });
  return toView(row);
}

async function disposeAsset(input: DisposeAssetInput): Promise<AssetView> {
  const row = await send<AssetResponse>("post", `/assets/${input.id}/dispose`, {
    version: input.version,
    disposed_at: input.disposedAt,
    proceeds: input.proceeds,
    // A write-off has nowhere for proceeds to go; do not send a stale pick.
    proceeds_account_id: input.proceeds > 0 ? input.proceedsAccountId || undefined : undefined,
    gain_loss_account_id: input.gainLossAccountId || undefined,
    note: input.note?.trim() || undefined,
  });
  return toView(row);
}

async function updateAsset(input: UpdateAssetInput): Promise<AssetView> {
  const row = await send<AssetResponse>("put", `/assets/${input.id}`, {
    version: input.version,
    name: input.name,
    residual_value: input.residualValue,
    useful_life_months: input.usefulLifeMonths,
    status: input.status,
  });
  return toView(row);
}

async function getAssetSchedule(id: string): Promise<AssetScheduleLine[]> {
  const row = await getOne<ScheduleResponse>(`/assets/${id}/schedule`);
  return row.lines.map((l) => ({ period: l.period, amount: l.amount, accumulatedAfter: l.accumulated_after }));
}

async function getAssetReconciliation(asOf: string): Promise<AssetReconciliationRow[]> {
  const row = await getOne<ReconciliationResponse>(`/assets/reconciliation?as_of=${asOf}`);
  return row.rows.map((r) => ({
    assetClass: r.asset_class,
    assetClasses: r.asset_classes ?? [r.asset_class],
    ledgerAccounts: r.ledger_accounts ?? [],
    registerCost: r.register_cost,
    ledgerAssetBalance: r.ledger_asset_balance,
    costDifference: r.cost_difference,
    registerAccumulated: r.register_accumulated,
    ledgerAccumulatedBalance: r.ledger_accumulated_balance,
    accumulatedDifference: r.accumulated_difference,
  }));
}

export const assetApiHttp: AssetApi = {
  disposeAsset,
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  getAssetSchedule,
  getAssetReconciliation,
};
