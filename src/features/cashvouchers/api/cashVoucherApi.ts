import { cashVoucherApiHttp } from "./cashVoucherApi.http";
import type { CashVoucherApi } from "./contract";

export type {
  CashVoucher,
  CashVoucherApi,
  CashVoucherFilters,
  CashVoucherLine,
  CashVoucherLineInput,
  CashVoucherStatus,
  CashVoucherType,
  CreateCashVoucherInput,
  UpdateCashVoucherInput,
} from "./contract";

const api: CashVoucherApi = cashVoucherApiHttp;

export const listCashVouchers = api.listCashVouchers.bind(api);
export const getCashVoucher = api.getCashVoucher.bind(api);
export const createCashVoucher = api.createCashVoucher.bind(api);
export const updateCashVoucher = api.updateCashVoucher.bind(api);
export const postCashVoucher = api.postCashVoucher.bind(api);
export const voidCashVoucher = api.voidCashVoucher.bind(api);
export const deleteCashVoucher = api.deleteCashVoucher.bind(api);
