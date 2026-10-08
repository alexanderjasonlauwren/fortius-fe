/**
 * The depreciation-run adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { depreciationRunApiMock } from "./depreciationRunApi.mock";
import { depreciationRunApiHttp } from "./depreciationRunApi.http";
import type { DepreciationRunApi } from "./contract";

export type { DepreciationRunApi, DepreciationRunStatus, DepreciationRunLineView, DepreciationRunView } from "./contract";

const api: DepreciationRunApi = pick(depreciationRunApiMock, depreciationRunApiHttp);

export const listRuns = api.listRuns.bind(api);
export const getRun = api.getRun.bind(api);
export const createRun = api.createRun.bind(api);
export const voidRun = api.voidRun.bind(api);
