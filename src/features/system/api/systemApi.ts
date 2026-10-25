import { systemApiHttp } from "./systemApi.http";
import type { SystemApi } from "./contract";

export type { SupplierView } from "./contract";

const api: SystemApi = systemApiHttp;

export const getSupplierList = api.getSupplierList.bind(api);
export const getSystemConfig = api.getSystemConfig.bind(api);
export const saveOperations = api.saveOperations.bind(api);
