import { financeSummaryHttp } from "./financeSummary.http";
import type { FinanceSummaryApi } from "./financeSummary.contract";

const api: FinanceSummaryApi = financeSummaryHttp;

export const getVerifiedCash = api.getVerifiedCash.bind(api);
export const getMonthlyReceivables = api.getMonthlyReceivables.bind(api);
export const getGrossMargin = api.getGrossMargin.bind(api);
