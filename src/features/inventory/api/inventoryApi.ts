import { inventoryApiHttp } from "./inventoryApi.http";
import type { InventoryApi } from "./contract";

export type { CountLine, OpeningLine, StockCount, StockCountLine, StockRow } from "./contract";

const api: InventoryApi = inventoryApiHttp;

export const getStock = api.getStock.bind(api);
export const recordOpeningStock = api.recordOpening.bind(api);
export const createStockCount = api.createStockCount.bind(api);
export const listStockCounts = api.listStockCounts.bind(api);
