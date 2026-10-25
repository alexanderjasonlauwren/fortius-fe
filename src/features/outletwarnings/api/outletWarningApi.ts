import { outletWarningApiHttp } from "./outletWarningApi.http";
import type { OutletWarningApi } from "./contract";

export type { OutletWarningView } from "./contract";

const api: OutletWarningApi = outletWarningApiHttp;

export const getOutletWarnings = api.getOutletWarnings.bind(api);
export const createOutletWarning = api.createOutletWarning.bind(api);
