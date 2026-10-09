/**
 * Vendors (Pembelian Umum suppliers), against the real API.
 *
 * Every field is a straight snake_case-to-camelCase rename of
 * fortius-backend's internal/entities/supplier response shapes.
 */
import { getList, send } from "@/lib/api";
import type { CreateVendorInput, UpdateVendorInput, VendorApi, VendorView } from "./contract";

interface SupplierResponse {
  id: string;
  code: string;
  name: string;
  npwp?: string;
  address?: string;
  phone?: string;
  status: string;
  version: number;
  created_at: string;
  updated_at: string;
}

function toView(row: SupplierResponse): VendorView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    npwp: row.npwp,
    address: row.address,
    phone: row.phone,
    status: row.status === "ina" ? "ina" : "atv",
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function getVendors(): Promise<VendorView[]> {
  const page = await getList<SupplierResponse>("/suppliers", {
    pageSize: 100,
    sort: [{ field: "name" }],
  });
  return page.items.map(toView);
}

async function createVendor(input: CreateVendorInput): Promise<VendorView> {
  const row = await send<SupplierResponse>("post", "/suppliers", {
    code: input.code,
    name: input.name,
    npwp: input.npwp || undefined,
    address: input.address || undefined,
    phone: input.phone || undefined,
  });
  return toView(row);
}

async function updateVendor(input: UpdateVendorInput): Promise<VendorView> {
  const row = await send<SupplierResponse>("put", `/suppliers/${input.id}`, {
    version: input.version,
    name: input.name,
    npwp: input.npwp,
    address: input.address,
    phone: input.phone,
    status: input.status,
  });
  return toView(row);
}

async function deleteVendor(id: string): Promise<void> {
  await send("delete", `/suppliers/${id}`);
}

export const vendorApiHttp: VendorApi = { getVendors, createVendor, updateVendor, deleteVendor };
