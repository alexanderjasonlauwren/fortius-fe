import { saRedemptionApiHttp } from "./saRedemptionApi.http";
import type { RedemptionApi } from "./contract";

export type {
  DeliveryInput, DeliveryStatus, DeliveryView, RecordRedemptionInput, RedemptionStatus, RedemptionView,
} from "./contract";

const api: RedemptionApi = saRedemptionApiHttp;

export const getRedemptions = api.getRedemptions.bind(api);
export const getRedemption = api.getRedemption.bind(api);
export const recordRedemption = api.recordRedemption.bind(api);
export const receiveDeliveries = api.receiveDeliveries.bind(api);
