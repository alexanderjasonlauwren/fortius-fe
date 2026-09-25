/**
 * The outlet adapter this build uses.
 *
 * Both implementations are passed to `pick`, so the choice is visible here and
 * a build cannot silently fall back to the mock.
 */
import { pick } from "@/lib/dataSource";
import { getOutletHistory as getOutletHistoryMock, outletApiMock } from "./outletApi.mock";
import { getOutletHistory as getOutletHistoryHttp, outletApiHttp } from "./outletApi.http";
import type { OutletApi } from "./contract";

export type { OutletView } from "./contract";

const api: OutletApi = pick(outletApiMock, outletApiHttp);

export const getOutletList = api.getOutletList.bind(api);
export const getOutletDetail = api.getOutletDetail.bind(api);
export const createOrUpdateOutlet = api.createOrUpdateOutlet.bind(api);
export const removeOutlet = api.removeOutlet.bind(api);
export const getKecamatanOptions = api.getKecamatanOptions.bind(api);
export const exportOutlet = api.exportOutlet.bind(api);

/**
 * An outlet's recent surat jalan.
 *
 * `GET /deliveries` (added for `reportApi.http.ts`) now serves this, filtered
 * by `outlet_id` and sorted newest first.
 */
export const getOutletHistory = pick(getOutletHistoryMock, getOutletHistoryHttp);
