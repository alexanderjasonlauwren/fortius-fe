import { depreciationRunApiHttp } from "./depreciationRunApi.http";
import type { DepreciationRunApi } from "./contract";

export type { DepreciationRunApi, DepreciationRunStatus, DepreciationRunLineView, DepreciationRunView } from "./contract";

const api: DepreciationRunApi = depreciationRunApiHttp;

export const listRuns = api.listRuns.bind(api);
export const getRun = api.getRun.bind(api);
export const createRun = api.createRun.bind(api);
