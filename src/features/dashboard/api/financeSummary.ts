import { pick } from "@/lib/dataSource";
import { financeSummaryHttp } from "./financeSummary.http";
import { financeSummaryMock } from "./financeSummary.mock";
import type { FinanceSummaryApi } from "./financeSummary.contract";

const api: FinanceSummaryApi = pick(financeSummaryMock, financeSummaryHttp);

export const getVerifiedCash = api.getVerifiedCash.bind(api);
export const getMonthlyReceivables = api.getMonthlyReceivables.bind(api);
export const getGrossMargin = api.getGrossMargin.bind(api);
