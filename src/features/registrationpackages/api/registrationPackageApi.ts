/**
 * The registration package adapter this build uses.
 */
import { pick } from "@/lib/dataSource";
import { registrationPackageApiMock } from "./registrationPackageApi.mock";
import { registrationPackageApiHttp } from "./registrationPackageApi.http";
import type { RegistrationPackageApi } from "./contract";

export type {
  CreateRegistrationPackageInput,
  RegistrationPackage,
  RegistrationPackageApi,
  RegistrationPackageItem,
  RegistrationPackageItemInput,
  UpdateRegistrationPackageInput,
} from "./contract";

const api: RegistrationPackageApi = pick(registrationPackageApiMock, registrationPackageApiHttp);

export const listPackages = api.listPackages.bind(api);
export const getPackage = api.getPackage.bind(api);
export const createPackage = api.createPackage.bind(api);
export const updatePackage = api.updatePackage.bind(api);
