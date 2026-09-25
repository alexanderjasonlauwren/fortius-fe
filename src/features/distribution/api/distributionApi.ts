/**
 * The distribution planning adapter this build uses.
 *
 * Both implementations are passed to `pick`, so the choice is visible here and
 * a build cannot silently fall back to the mock.
 */
import { pick } from "@/lib/dataSource";
import {
  addApprovedOrders as addApprovedOrdersMock,
  distributionApiMock,
  printRouteSheet as printRouteSheetMock,
} from "./distributionApi.mock";
import {
  addApprovedOrders as addApprovedOrdersHttp,
  distributionApiHttp,
  printRouteSheet as printRouteSheetHttp,
} from "./distributionApi.http";
import type { DistributionApi } from "./contract";

const api: DistributionApi = pick(distributionApiMock, distributionApiHttp);

export const getPlanList = api.getPlanList.bind(api);
export const getPlan = api.getPlan.bind(api);
export const getPlanDetail = api.getPlanDetail.bind(api);
export const getMonthlyGrid = api.getMonthlyGrid.bind(api);
export const getPaymentBoard = api.getPaymentBoard.bind(api);
export const createPlan = api.createPlan.bind(api);
export const createSourcePlan = api.createSourcePlan.bind(api);
export const saveDraft = api.saveDraft.bind(api);
export const confirmPlan = api.confirmPlan.bind(api);
export const cancelDistributionPlan = api.cancelDistributionPlan.bind(api);
export const getOutletOptions = api.getOutletOptions.bind(api);
export const getProductOptions = api.getProductOptions.bind(api);
export const getSAProductOptions = api.getSAProductOptions.bind(api);
export const getDriverOptions = api.getDriverOptions.bind(api);
export const getVehicleOptions = api.getVehicleOptions.bind(api);
export const getActiveSaOptions = api.getActiveSaOptions.bind(api);
export const getSAOutletPlan = api.getSAOutletPlan.bind(api);
export const suggestAssignment = api.suggestAssignment.bind(api);
export const applyAssignment = api.applyAssignment.bind(api);
export const dispatchTrip = api.dispatchTrip.bind(api);

/**
 * Scheduling approved orders onto a plan, real now that `core.orders` has a
 * module to serve it (D3 B-Step 2). `addApprovedOrdersHttp` is not a second
 * implementation of this -- it calls straight into `orderApi.http.ts`'s own
 * `scheduleOneOrder`, so there is exactly one place this request is made.
 */
export const addApprovedOrders = pick(addApprovedOrdersMock, addApprovedOrdersHttp);

/**
 * The address gap that kept this mock-only is closed: `printRouteSheetHttp`
 * resolves each stop's address from `getOutletList()`. The delivery-time gap
 * is real and stays a "—", the same placeholder the live planning screen
 * already shows for it.
 */
export const printRouteSheet = pick(printRouteSheetMock, printRouteSheetHttp);
