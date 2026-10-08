/**
 * The asset register, against the mock database.
 *
 * Opening balances aside, nothing here posts a journal -- that is
 * depreciationruns' own job. An asset's cost/opening-accumulated reaching
 * the ledger is an opening-balance-wizard concern (gap-closing plan, Phase
 * E), not this module's; "Rekonsiliasi" below is exactly what surfaces the
 * gap until that exists, the same as the real backend's own
 * GetAssetReconciliation.
 */
import { monthlyAmount, chargeFor } from "@/features/depreciationruns/lib/depreciation";
import { accountBalances } from "@/mocks/ledger";
import { ApiError, latency, mutate, nextId } from "@/mocks/db";
import { scopedDb, stampScope } from "@/mocks/scope";
import type { AssetEntity } from "@/types/domain";
import type {
  AssetApi,
  AssetClass,
  AssetReconciliationRow,
  AssetScheduleLine,
  AssetView,
  CreateAssetInput,
  UpdateAssetInput,
} from "./contract";

/** The same asset_class -> default account mapping the real backend's
 *  classDefaults table carries (internal/usecase/asset/services.go).
 *  accumulatedCode is null for "prepaid": its amortisation credits the
 *  asset account itself, so there is no default contra-asset. */
const CLASS_DEFAULTS: Record<AssetClass, { assetCode: string; accumulatedCode: string | null; expenseCode: string }> = {
  building: { assetCode: "1-2100", accumulatedCode: "1-2900", expenseCode: "5-5100" },
  vehicle: { assetCode: "1-2200", accumulatedCode: "1-2900", expenseCode: "5-5200" },
  office_equipment: { assetCode: "1-2300", accumulatedCode: "1-2900", expenseCode: "5-5300" },
  intangible: { assetCode: "1-3100", accumulatedCode: "1-3900", expenseCode: "5-5400" },
  prepaid: { assetCode: "1-1500", accumulatedCode: null, expenseCode: "5-5500" },
};

/** Resolves an explicit override account id when given, else the class's
 *  own default code -- mirrors the real backend's resolveAccountID. */
function resolveAccountId(db: ReturnType<typeof scopedDb>, override: string | undefined, defaultCode: string) {
  if (override) {
    const found = db.accounts.find((a) => a.id === override);
    if (!found) throw new ApiError("Akun tidak ditemukan.", 400);
    return found;
  }
  const found = db.accounts.find((a) => a.kode === defaultCode);
  if (!found) throw new ApiError(`Tenant tidak memiliki akun dengan kode ${defaultCode}.`, 500);
  return found;
}

/** The one mapping that may legitimately resolve to nothing: no override
 *  and no class default (only "prepaid" has none). */
function resolveAccumulatedAccountId(
  db: ReturnType<typeof scopedDb>,
  override: string | undefined,
  defaultCode: string | null,
) {
  if (override) return resolveAccountId(db, override, "");
  if (defaultCode === null) return undefined;
  return resolveAccountId(db, undefined, defaultCode);
}

function periodEndDate(period: string): string {
  const [y, m] = period.split("-").map(Number);
  return new Date(Date.UTC(y, m, 0)).toISOString().slice(0, 10);
}

/** Every posted (never voided) run's own line for this asset, through and
 *  including `asOf`. */
function sumPostedThrough(db: ReturnType<typeof scopedDb>, assetId: string, asOf: string): number {
  let total = 0;
  for (const run of db.depreciationRuns) {
    if (run.status !== "posted" || periodEndDate(run.period) > asOf) continue;
    for (const line of run.lines) {
      if (line.assetId === assetId) total += line.amount;
    }
  }
  return total;
}

function toView(db: ReturnType<typeof scopedDb>, row: AssetEntity): AssetView {
  const assetAccount = db.accounts.find((a) => a.id === row.assetAccountId);
  const accumulatedAccount = row.accumulatedAccountId
    ? db.accounts.find((a) => a.id === row.accumulatedAccountId)
    : undefined;
  const expenseAccount = db.accounts.find((a) => a.id === row.expenseAccountId);
  const today = new Date().toISOString().slice(0, 10);
  return {
    id: row.id,
    assetCode: row.assetCode,
    name: row.name,
    assetClass: row.assetClass,
    acquisitionDate: row.acquisitionDate,
    depreciationStartDate: row.depreciationStartDate,
    cost: row.cost,
    residualValue: row.residualValue,
    usefulLifeMonths: row.usefulLifeMonths,
    method: row.method,
    openingAccumulated: row.openingAccumulated,
    openingAsOf: row.openingAsOf,
    assetAccountId: row.assetAccountId,
    assetAccountCode: assetAccount?.kode ?? "",
    accumulatedAccountId: row.accumulatedAccountId,
    accumulatedAccountCode: accumulatedAccount?.kode,
    expenseAccountId: row.expenseAccountId,
    expenseAccountCode: expenseAccount?.kode ?? "",
    vehicleId: row.vehicleId,
    status: row.status,
    disposedAt: row.disposedAt,
    monthlyAmount: monthlyAmount(row.cost, row.residualValue, row.usefulLifeMonths),
    accumulatedToDate: row.openingAccumulated + sumPostedThrough(db, row.id, today),
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function listAssets(): Promise<AssetView[]> {
  await latency("read");
  const db = scopedDb();
  return [...db.assets].sort((a, b) => a.assetCode.localeCompare(b.assetCode)).map((row) => toView(db, row));
}

async function getAsset(id: string): Promise<AssetView> {
  await latency("read");
  const db = scopedDb();
  const row = db.assets.find((a) => a.id === id);
  if (!row) throw new ApiError("Aset tidak ditemukan.", 404);
  return toView(db, row);
}

async function createAsset(input: CreateAssetInput): Promise<AssetView> {
  await latency("write");
  const classDef = CLASS_DEFAULTS[input.assetClass];
  if (!classDef) throw new ApiError("Kelas aset tidak dikenal.", 422);
  if (!input.assetCode.trim()) throw new ApiError("Kode aset wajib diisi.", 422);
  const cost = input.cost;
  const residual = input.residualValue ?? 0;
  if (residual >= cost) throw new ApiError("Nilai residu harus lebih kecil dari harga perolehan.", 422);
  const openingAccumulated = input.openingAccumulated ?? 0;
  if (openingAccumulated > cost - residual) {
    throw new ApiError("Akumulasi awal tidak boleh melebihi harga perolehan dikurangi nilai residu.", 422);
  }
  if (openingAccumulated > 0 && !input.openingAsOf) {
    throw new ApiError("Per tanggal akumulasi awal wajib diisi jika akumulasi awal diisi.", 422);
  }

  return mutate((db) => {
    if (db.assets.some((a) => a.assetCode === input.assetCode.trim())) {
      throw new ApiError("Kode aset sudah digunakan.", 409, "DUPLICATE");
    }
    const assetAccount = resolveAccountId(db, input.assetAccountId, classDef.assetCode);
    const accumulatedAccount = resolveAccumulatedAccountId(db, input.accumulatedAccountId, classDef.accumulatedCode);
    const expenseAccount = resolveAccountId(db, input.expenseAccountId, classDef.expenseCode);
    if (input.vehicleId && !db.vehicles.some((v) => v.id === input.vehicleId)) {
      throw new ApiError("Kendaraan tidak ditemukan.", 400);
    }

    const now = new Date().toISOString();
    const row: AssetEntity = stampScope({
      id: nextId("ast"),
      assetCode: input.assetCode.trim(),
      name: input.name.trim(),
      assetClass: input.assetClass,
      acquisitionDate: input.acquisitionDate,
      depreciationStartDate: input.depreciationStartDate,
      cost, residualValue: residual,
      usefulLifeMonths: input.usefulLifeMonths,
      method: "straight_line",
      openingAccumulated,
      openingAsOf: input.openingAsOf,
      assetAccountId: assetAccount.id,
      accumulatedAccountId: accumulatedAccount?.id,
      expenseAccountId: expenseAccount.id,
      vehicleId: input.vehicleId,
      status: "active",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    db.assets.push(row);
    return toView(db, row);
  });
}

async function updateAsset(input: UpdateAssetInput): Promise<AssetView> {
  await latency("write");
  if ((input.status === "disposed") !== !!input.disposedAt) {
    throw new ApiError("Per tanggal pelepasan wajib diisi hanya jika status Dilepas.", 422);
  }

  return mutate((db) => {
    const row = db.assets.find((a) => a.id === input.id);
    if (!row) throw new ApiError("Aset tidak ditemukan.", 404);
    if (row.version !== input.version) {
      throw new ApiError("Aset sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    row.name = input.name.trim();
    row.residualValue = input.residualValue;
    row.usefulLifeMonths = input.usefulLifeMonths;
    row.status = input.status;
    row.disposedAt = input.disposedAt;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toView(db, row);
  });
}

/** Projects the month-by-month charge from depreciation_start_date for
 *  exactly useful_life_months periods -- what the asset WOULD charge,
 *  independent of any run that has actually posted. */
async function getAssetSchedule(id: string): Promise<AssetScheduleLine[]> {
  await latency("read");
  const db = scopedDb();
  const row = db.assets.find((a) => a.id === id);
  if (!row) throw new ApiError("Aset tidak ditemukan.", 404);

  const lines: AssetScheduleLine[] = [];
  let accumulated = row.openingAccumulated;
  const [startYear, startMonth] = row.depreciationStartDate.slice(0, 7).split("-").map(Number);
  for (let index = 1; index <= row.usefulLifeMonths; index++) {
    const amount = chargeFor(row.cost, row.residualValue, row.usefulLifeMonths, index);
    accumulated += amount;
    const totalMonths = startYear * 12 + (startMonth - 1) + (index - 1);
    const period = `${Math.floor(totalMonths / 12)}-${String((totalMonths % 12) + 1).padStart(2, "0")}`;
    lines.push({ period, amount, accumulatedAfter: accumulated });
  }
  return lines;
}

/** Compares the register to the ledger, per asset_class, as of a date --
 *  mirrors the real backend's own GetAssetReconciliation grouping. */
async function getAssetReconciliation(asOf: string): Promise<AssetReconciliationRow[]> {
  await latency("read");
  const db = scopedDb();
  const balances = accountBalances(db, { to: asOf });
  const balanceByAccountId = new Map(balances.map((b) => [b.akun.id, b.saldo]));

  interface Totals {
    registerCost: number;
    registerAccumulated: number;
    assetAccountIds: Set<string>;
    accumulatedAccountIds: Set<string>;
  }
  const byClass = new Map<AssetClass, Totals>();

  for (const row of db.assets) {
    if (row.acquisitionDate > asOf) continue;
    const t = byClass.get(row.assetClass) ?? {
      registerCost: 0, registerAccumulated: 0,
      assetAccountIds: new Set<string>(), accumulatedAccountIds: new Set<string>(),
    };
    t.registerCost += row.cost;
    t.assetAccountIds.add(row.assetAccountId);
    t.registerAccumulated += row.openingAccumulated + sumPostedThrough(db, row.id, asOf);
    if (row.accumulatedAccountId) t.accumulatedAccountIds.add(row.accumulatedAccountId);
    byClass.set(row.assetClass, t);
  }

  const round = (n: number) => Math.round(n * 100) / 100;
  return [...byClass.entries()].map(([assetClass, t]) => {
    const ledgerAsset = [...t.assetAccountIds].reduce((s, id) => s + (balanceByAccountId.get(id) ?? 0), 0);
    const ledgerAccumulated = [...t.accumulatedAccountIds].reduce((s, id) => s + (balanceByAccountId.get(id) ?? 0), 0);
    return {
      assetClass,
      registerCost: round(t.registerCost),
      ledgerAssetBalance: round(ledgerAsset),
      costDifference: round(t.registerCost - ledgerAsset),
      registerAccumulated: round(t.registerAccumulated),
      ledgerAccumulatedBalance: round(ledgerAccumulated),
      accumulatedDifference: round(t.registerAccumulated - ledgerAccumulated),
    };
  });
}

export const assetApiMock: AssetApi = {
  listAssets,
  getAsset,
  createAsset,
  updateAsset,
  getAssetSchedule,
  getAssetReconciliation,
};
