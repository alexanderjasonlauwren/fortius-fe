/**
 * The transportation-claim adapter this build uses.
 *
 * Both implementations are passed to `pick`, so the choice is visible here
 * and a build cannot silently fall back to the mock.
 */
import { pick } from "@/lib/dataSource";
import { transportationApiMock } from "./transportationApi.mock";
import { transportationApiHttp } from "./transportationApi.http";
import type { TransportationClaimApi } from "./contract";

export type { ClaimView, BeritaAcaraDocument, RecapReport, RecapRow } from "./contract";

const api: TransportationClaimApi = pick(transportationApiMock, transportationApiHttp);

export const getClaims = api.getClaims.bind(api);
export const createClaim = api.createClaim.bind(api);
export const updateClaim = api.updateClaim.bind(api);
export const updateClaimStatus = api.updateClaimStatus.bind(api);
export const deleteClaim = api.deleteClaim.bind(api);
export const generateLines = api.generateLines.bind(api);
export const getDocument = api.getDocument.bind(api);
export const getRecap = api.getRecap.bind(api);
