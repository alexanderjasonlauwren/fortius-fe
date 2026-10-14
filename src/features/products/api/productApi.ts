import { productApiHttp } from "./productApi.http";
import type { ProductApi } from "./contract";

export type { ProductFilters, ProductView, StockSummary, UnitOption } from "./contract";

const api: ProductApi = productApiHttp;

export const getProducts = api.getProducts.bind(api);
export const getProductDetail = api.getProductDetail.bind(api);
export const createOrUpdateProduct = api.createOrUpdateProduct.bind(api);
export const removeProduct = api.removeProduct.bind(api);
export const changeStock = api.changeStock.bind(api);
export const getStockSummary = api.getStockSummary.bind(api);
export const exportProducts = api.exportProducts.bind(api);
export const getUnits = api.getUnits.bind(api);
