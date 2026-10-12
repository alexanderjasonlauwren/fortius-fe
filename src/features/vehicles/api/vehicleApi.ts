import { vehicleApiHttp } from "./vehicleApi.http";
import type { VehicleApi } from "./contract";

export type { VehicleView } from "./contract";

const api: VehicleApi = vehicleApiHttp;

export const getVehicles = api.getVehicles.bind(api);
export const getVehicleDetail = api.getVehicleDetail.bind(api);
export const createOrUpdateVehicle = api.createOrUpdateVehicle.bind(api);
export const removeVehicle = api.removeVehicle.bind(api);
