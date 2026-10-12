import { sim3lonLiveHttp } from "./sim3lonlive.http";
import type { Sim3lonLiveApi } from "./contract";

const api: Sim3lonLiveApi = sim3lonLiveHttp;

export const getSnapshot = api.getSnapshot.bind(api);
export const sync = api.sync.bind(api);
