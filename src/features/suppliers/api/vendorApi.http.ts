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
  email?: string;
  contact_person?: string;
  payment_terms_days?: number;
  bank_name?: string;
  bank_account_number?: string;
  bank_account_holder?: string;
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
    email: row.email,
    contactPerson: row.contact_person,
    paymentTermsDays: row.payment_terms_days,
    bankName: row.bank_name,
    bankAccountNumber: row.bank_account_number,
    bankAccountHolder: row.bank_account_holder,
    status: row.status === "ina" ? "ina" : "atv",
    version: row.version,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

/** Contact, terms and bank details. Sent as typed -- the backend trims, and
 *  stores a blank as "none", which is how a field is cleared. */
function paymentDetails(input: CreateVendorInput | UpdateVendorInput) {
  return {
    email: input.email,
    contact_person: input.contactPerson,
    payment_terms_days: input.paymentTermsDays,
    bank_name: input.bankName,
    bank_account_number: input.bankAccountNumber,
    bank_account_holder: input.bankAccountHolder,
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
    ...paymentDetails(input),
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
    ...paymentDetails(input),
    status: input.status,
  });
  return toView(row);
}

async function deleteVendor(id: string): Promise<void> {
  await send("delete", `/suppliers/${id}`);
}

export const vendorApiHttp: VendorApi = { getVendors, createVendor, updateVendor, deleteVendor };
