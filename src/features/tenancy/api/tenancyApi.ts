import type { TenancyApi } from "./contract";
import * as httpApi from "./tenancyApi.http";

const api: TenancyApi = httpApi;

export const getTenants = api.getTenants;
export const getTenant = api.getTenant;
export const createTenant = api.createTenant;
export const deactivateTenant = api.deactivateTenant;
export const getBranches = api.getBranches;
