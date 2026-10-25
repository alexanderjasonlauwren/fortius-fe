import { financereportsApiHttp } from "./financereportsApi.http";
import type { FinanceReportsApi } from "./contract";

export { CATEGORY_LABEL, CATEGORY_ORDER } from "./contract";
export type {
  Report,
  ReportCategory,
  ReportCheck,
  ReportColumn,
  ReportDefinition,
  ReportLink,
  ReportQuery,
  ReportRow,
} from "./contract";

const api: FinanceReportsApi = financereportsApiHttp;

export const getReportCatalogue = api.getCatalogue.bind(api);
export const getFinanceReport = api.getReport.bind(api);
export const downloadFinanceReport = api.downloadReport.bind(api);
