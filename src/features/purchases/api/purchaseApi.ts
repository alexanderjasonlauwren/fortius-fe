/**
 * The purchase adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { purchaseApiMock } from "./purchaseApi.mock";
import { purchaseApiHttp } from "./purchaseApi.http";
import type { PurchaseApi } from "./contract";

export type {
  GeneralPurchaseLineInput,
  PayPurchaseInput,
  PurchaseApi,
  PurchaseFilters,
  PurchaseLineView,
  PurchaseView,
  RecordGeneralPurchaseInput,
} from "./contract";

const api: PurchaseApi = pick(purchaseApiMock, purchaseApiHttp);

export const getPurchases = api.getPurchases.bind(api);
export const recordGeneralPurchase = api.recordGeneralPurchase.bind(api);
export const payPurchase = api.payPurchase.bind(api);
