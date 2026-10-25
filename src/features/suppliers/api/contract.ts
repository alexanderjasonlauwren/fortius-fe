/**
 * What every vendor adapter must provide.
 *
 * Gap-closing plan, Phase F: a real `core.suppliers` master table, for
 * Pembelian Umum (general purchases) only -- not the same concept
 * `SupplierSection.tsx`/`systemApi` name, which is a free-text name off
 * `core.schedule_agreements.supplier_name` read through the tenant's own
 * configurable "Pemasok" lexicon term. See `VendorEntity`'s own doc in
 * `@/types/domain` for why the two never share a row.
 */

export interface VendorView {
  id: string;
  code: string;
  name: string;
  npwp?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  /** Default term for a new bill: due date = bill date + this many days. */
  paymentTermsDays?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  status: "atv" | "ina";
  version: number;
  createdAt: string;
  updatedAt: string;
}

export interface CreateVendorInput {
  code: string;
  name: string;
  npwp?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  /** Default term for a new bill: due date = bill date + this many days. */
  paymentTermsDays?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
}

export interface UpdateVendorInput {
  id: string;
  version: number;
  name?: string;
  npwp?: string;
  address?: string;
  phone?: string;
  email?: string;
  contactPerson?: string;
  /** Default term for a new bill: due date = bill date + this many days. */
  paymentTermsDays?: number;
  bankName?: string;
  bankAccountNumber?: string;
  bankAccountHolder?: string;
  status?: "atv" | "ina";
}

export interface VendorApi {
  getVendors(): Promise<VendorView[]>;
  createVendor(input: CreateVendorInput): Promise<VendorView>;
  updateVendor(input: UpdateVendorInput): Promise<VendorView>;
  deleteVendor(id: string): Promise<void>;
}
