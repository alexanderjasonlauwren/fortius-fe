import { dashboardApiHttp } from "./dashboardApi.http";
import type { DashboardApi } from "./contract";

const api: DashboardApi = dashboardApiHttp;

export const getSummary = api.getSummary.bind(api);
export const getRecentAudit = api.getRecentAudit.bind(api);
