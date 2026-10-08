/**
 * The asset-register adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { assetApiMock } from "./assetApi.mock";
import { assetApiHttp } from "./assetApi.http";
import type { AssetApi } from "./contract";

export type {
  AssetApi,
  AssetClass,
  AssetReconciliationRow,
  AssetScheduleLine,
  AssetStatus,
  AssetView,
  CreateAssetInput,
  UpdateAssetInput,
} from "./contract";

const api: AssetApi = pick(assetApiMock, assetApiHttp);

export const listAssets = api.listAssets.bind(api);
export const getAsset = api.getAsset.bind(api);
export const createAsset = api.createAsset.bind(api);
export const updateAsset = api.updateAsset.bind(api);
export const getAssetSchedule = api.getAssetSchedule.bind(api);
export const getAssetReconciliation = api.getAssetReconciliation.bind(api);
