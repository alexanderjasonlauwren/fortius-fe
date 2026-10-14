import { purchaseApiHttp } from "./purchaseApi.http";
import type { PurchaseApi } from "./contract";

export type {
  GeneralPurchaseLineInput,
  PayPurchaseInput,
  PurchaseApi,
  PurchaseFilters,
  PurchaseLineView,
  PurchasePaymentStatus,
  PurchasePaymentView,
  PurchaseView,
  RecordGeneralPurchaseInput,
  RecordPurchasePaymentInput,
} from "./contract";

const api: PurchaseApi = purchaseApiHttp;

export const getPurchases = api.getPurchases.bind(api);
export const recordGeneralPurchase = api.recordGeneralPurchase.bind(api);
export const payPurchase = api.payPurchase.bind(api);
export const getPurchase = api.getPurchase.bind(api);
export const recordPurchasePayment = api.recordPurchasePayment.bind(api);
export const voidPurchasePayment = api.voidPurchasePayment.bind(api);
export const voidPurchase = api.voidPurchase.bind(api);
