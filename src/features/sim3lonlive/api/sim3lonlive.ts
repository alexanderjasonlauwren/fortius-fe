/**
 * The SIM3LON live adapter this build uses.
 *
 * Both implementations are passed to `pick`, so the choice is visible here and a
 * build configured for the API cannot silently fall back to the demo snapshot.
 */
import { pick } from "@/lib/dataSource";
import { sim3lonLiveHttp } from "./sim3lonlive.http";
import { sim3lonLiveMock } from "./sim3lonlive.mock";
import type { Sim3lonLiveApi } from "./contract";

const api: Sim3lonLiveApi = pick(sim3lonLiveMock, sim3lonLiveHttp);

export const getSnapshot = api.getSnapshot.bind(api);
export const sync = api.sync.bind(api);
