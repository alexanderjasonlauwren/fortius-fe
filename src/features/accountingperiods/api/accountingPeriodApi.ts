import { accountingPeriodApiHttp } from "./accountingPeriodApi.http";
import type { AccountingPeriodApi } from "./contract";

export { PERIOD_STATUS_LABEL } from "./contract";
export type { AccountingPeriod, PeriodStatus } from "./contract";

const api: AccountingPeriodApi = accountingPeriodApiHttp;

export const listAccountingPeriods = api.listYear.bind(api);
export const setAccountingPeriodStatus = api.setStatus.bind(api);
