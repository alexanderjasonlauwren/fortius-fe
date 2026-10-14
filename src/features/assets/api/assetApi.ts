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
  DisposeAssetInput,
  UpdateAssetInput,
} from "./contract";

const api: AssetApi = assetApiHttp;

export const listAssets = api.listAssets.bind(api);
export const getAsset = api.getAsset.bind(api);
export const createAsset = api.createAsset.bind(api);
export const updateAsset = api.updateAsset.bind(api);
export const disposeAsset = api.disposeAsset.bind(api);
export const getAssetSchedule = api.getAssetSchedule.bind(api);
export const getAssetReconciliation = api.getAssetReconciliation.bind(api);
