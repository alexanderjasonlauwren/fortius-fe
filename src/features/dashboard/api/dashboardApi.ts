import { dashboardApiHttp } from "./dashboardApi.http";
import type { DashboardApi } from "./contract";

const api: DashboardApi = dashboardApiHttp;

export const getKpiSummary = api.getKpiSummary.bind(api);
export const getMonthlyChart = api.getMonthlyChart.bind(api);
export const getOutletShares = api.getOutletShares.bind(api);
export const getRecentActivities = api.getRecentActivities.bind(api);
export const getDispatchRail = api.getDispatchRail.bind(api);
export const getRecentAudit = api.getRecentAudit.bind(api);
