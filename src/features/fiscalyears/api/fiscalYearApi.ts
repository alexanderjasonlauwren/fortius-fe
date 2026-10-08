/**
 * The fiscal-year adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { fiscalYearApiMock } from "./fiscalYearApi.mock";
import { fiscalYearApiHttp } from "./fiscalYearApi.http";
import type { FiscalYearApi } from "./contract";

export type { FiscalYearApi, FiscalYearStatus, FiscalYearView } from "./contract";

const api: FiscalYearApi = pick(fiscalYearApiMock, fiscalYearApiHttp);

export const listFiscalYears = api.listFiscalYears.bind(api);
export const closeFiscalYear = api.closeFiscalYear.bind(api);
export const reopenFiscalYear = api.reopenFiscalYear.bind(api);
