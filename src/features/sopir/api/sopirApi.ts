import { sopirApiHttp } from "./sopirApi.http";
import type { SopirApi } from "./contract";

export type { CompleteStopInput, GpsFixInput, StopReceipt } from "./contract";

const api: SopirApi = sopirApiHttp;

export const getMyRun = api.getMyRun.bind(api);
export const departStop = api.departStop.bind(api);
export const arriveStop = api.arriveStop.bind(api);
export const completeStop = api.completeStop.bind(api);
export const holdStop = api.holdStop.bind(api);
export const getDriverOptions = api.getDriverOptions.bind(api);
export const postGpsFixes = api.postGpsFixes.bind(api);
