import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping for the asset register, following
 * registrationPackageApi.test.ts's own pattern.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { assetApiHttp } = await import("./assetApi.http");

const ID = "11111111-1111-4111-8111-111111111111";
const ASSET_ACCOUNT_ID = "22222222-2222-4222-8222-222222222222";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    asset_code: "AST-VHC-001",
    name: "Truk Isuzu",
    asset_class: "vehicle",
    acquisition_date: "2024-06-01",
    depreciation_start_date: "2024-06-01",
    cost: 350_000_000,
    residual_value: 50_000_000,
    useful_life_months: 60,
    method: "straight_line",
    opening_accumulated: 0,
    asset_account_id: ASSET_ACCOUNT_ID,
    asset_account_code: "1-2200",
    expense_account_id: "33333333-3333-4333-8333-333333333333",
    expense_account_code: "5-5200",
    status: "active",
    monthly_amount: 5_000_000,
    accumulated_to_date: 0,
    version: 1,
    created_at: "2026-10-01T00:00:00Z",
    updated_at: "2026-10-01T00:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

it("maps an asset's computed fields alongside its register fields", async () => {
  getOne.mockResolvedValue(wire());
  const asset = await assetApiHttp.getAsset(ID);
  expect(asset.monthlyAmount).toBe(5_000_000);
  expect(asset.assetAccountCode).toBe("1-2200");
  expect(asset.accumulatedAccountId).toBeUndefined();
});

it("sorts the list by asset code", async () => {
  getList.mockResolvedValue({ items: [] });
  await assetApiHttp.listAssets();
  const [, params] = getList.mock.calls[0];
  expect(params.sort).toEqual([{ field: "asset_code" }]);
});

describe("writing", () => {
  it("sends a new asset's class and account overrides", async () => {
    send.mockResolvedValue(wire());
    await assetApiHttp.createAsset({
      assetCode: "AST-VHC-002", name: "Truk Baru", assetClass: "vehicle",
      acquisitionDate: "2026-10-01", depreciationStartDate: "2026-10-01",
      cost: 400_000_000, usefulLifeMonths: 60,
    });
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/assets");
    expect(body.asset_class).toBe("vehicle");
    expect(body.asset_account_id).toBeUndefined();
  });

  it("sends the version on update", async () => {
    send.mockResolvedValue(wire());
    await assetApiHttp.updateAsset({
      id: ID, version: 2, name: "Truk Isuzu", residualValue: 50_000_000,
      usefulLifeMonths: 60, status: "active",
    });
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(path).toBe(`/assets/${ID}`);
    expect(body.version).toBe(2);
  });
});

describe("schedule and reconciliation", () => {
  it("maps a schedule's periods", async () => {
    getOne.mockResolvedValue({ asset_id: ID, lines: [{ period: "2026-10", amount: 5_000_000, accumulated_after: 5_000_000 }] });
    const lines = await assetApiHttp.getAssetSchedule(ID);
    expect(lines).toEqual([{ period: "2026-10", amount: 5_000_000, accumulatedAfter: 5_000_000 }]);
  });

  it("maps reconciliation rows", async () => {
    getOne.mockResolvedValue({
      as_of: "2026-10-07",
      rows: [{
        asset_class: "vehicle", register_cost: 350_000_000, ledger_asset_balance: 0, cost_difference: 350_000_000,
        register_accumulated: 0, ledger_accumulated_balance: 0, accumulated_difference: 0,
      }],
    });
    const rows = await assetApiHttp.getAssetReconciliation("2026-10-07");
    expect(rows[0].costDifference).toBe(350_000_000);
    expect(getOne).toHaveBeenCalledWith("/assets/reconciliation?as_of=2026-10-07");
  });
});
