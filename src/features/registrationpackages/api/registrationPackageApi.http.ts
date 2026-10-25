/**
 * Registration package templates, against the real API.
 *
 * Every field is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/registrationpackage response shapes.
 */
import { getList, getOne, send } from "@/lib/api";
import type {
  CreateRegistrationPackageInput,
  RegistrationPackage,
  RegistrationPackageApi,
  RegistrationPackageItem,
  RegistrationPackageItemInput,
  UpdateRegistrationPackageInput,
} from "./contract";

interface ItemResponse {
  product_id: string;
  product_code: string;
  product_name: string;
  qty: number;
}

interface PackageResponse {
  id: string;
  name: string;
  fee_amount: number;
  is_default: boolean;
  is_active: boolean;
  items: ItemResponse[];
  version: number;
  created_at: string;
  updated_at: string;
}

function toItem(row: ItemResponse): RegistrationPackageItem {
  return {
    productId: row.product_id,
    productCode: row.product_code,
    productName: row.product_name,
    qty: row.qty,
  };
}

function toPackage(row: PackageResponse): RegistrationPackage {
  return {
    id: row.id,
    name: row.name,
    feeAmount: row.fee_amount,
    isDefault: row.is_default,
    isActive: row.is_active,
    items: (row.items ?? []).map(toItem),
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function toItemRequest(item: RegistrationPackageItemInput) {
  return { product_id: item.productId, qty: item.qty };
}

async function listPackages(): Promise<RegistrationPackage[]> {
  const page = await getList<PackageResponse>("/registration-packages", {
    pageSize: 100,
    sort: [{ field: "name" }],
  });
  return page.items.map(toPackage);
}

async function getPackage(id: string): Promise<RegistrationPackage> {
  return toPackage(await getOne<PackageResponse>(`/registration-packages/${id}`));
}

async function createPackage(input: CreateRegistrationPackageInput): Promise<RegistrationPackage> {
  const row = await send<PackageResponse>("post", "/registration-packages", {
    name: input.name,
    fee_amount: input.feeAmount,
    is_default: input.isDefault ?? false,
    items: input.items?.map(toItemRequest),
  });
  return toPackage(row);
}

async function updatePackage(input: UpdateRegistrationPackageInput): Promise<RegistrationPackage> {
  const row = await send<PackageResponse>("put", `/registration-packages/${input.id}`, {
    version: input.version,
    name: input.name,
    fee_amount: input.feeAmount,
    is_default: input.isDefault,
    is_active: input.isActive,
    items: input.items?.map(toItemRequest),
  });
  return toPackage(row);
}

export const registrationPackageApiHttp: RegistrationPackageApi = {
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
};
