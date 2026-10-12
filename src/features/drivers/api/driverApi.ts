import { driverApiHttp, getDriverSchedule as getDriverScheduleHttp } from "./driverApi.http";
import type { DriverApi } from "./contract";

export type { DriverView } from "./contract";

const api: DriverApi = driverApiHttp;

export const getDrivers = api.getDrivers.bind(api);
export const getDriverDetail = api.getDriverDetail.bind(api);
export const createOrUpdateDriver = api.createOrUpdateDriver.bind(api);
export const removeDriver = api.removeDriver.bind(api);
export const exportDrivers = api.exportDrivers.bind(api);

/**
 * Today's stop list for one driver.
 *
 * `GET /deliveries` (added for `reportApi.http.ts`) now serves this: filtered
 * by `driver_id` and today's `date`, the same way the dispatch board answers
 * "which stops are on which run" but keyed by driver instead of by plan.
 */
export const getDriverSchedule = getDriverScheduleHttp;
