import { reportApiHttp } from "./reportApi.http";
import type { ReportsApi } from "./contract";

export { RANGE_LABEL, resolveRange } from "./contract";
export type {
  DailyPoint,
  DriverPerformanceRow,
  ReportRange,
  ReportSummary,
  TopOutletRow,
} from "./contract";

const api: ReportsApi = reportApiHttp;

export const getReportSummary = api.getReportSummary.bind(api);
export const getDailySeries = api.getDailySeries.bind(api);
export const getTopOutlet = api.getTopOutlet.bind(api);
export const getDriverPerformance = api.getDriverPerformance.bind(api);
export const exportReport = api.exportReport.bind(api);
export const printReport = api.printReport.bind(api);
