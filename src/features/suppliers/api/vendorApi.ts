/**
 * The vendor adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { vendorApiMock } from "./vendorApi.mock";
import { vendorApiHttp } from "./vendorApi.http";
import type { VendorApi } from "./contract";

export type { CreateVendorInput, UpdateVendorInput, VendorApi, VendorView } from "./contract";

const api: VendorApi = pick(vendorApiMock, vendorApiHttp);

export const getVendors = api.getVendors.bind(api);
export const createVendor = api.createVendor.bind(api);
export const updateVendor = api.updateVendor.bind(api);
export const deleteVendor = api.deleteVendor.bind(api);
