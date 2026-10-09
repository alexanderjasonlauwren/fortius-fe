/**
 * Vendors (Pembelian Umum suppliers), against the mock database.
 */
import { ApiError, latency, mutate, nextId } from "@/mocks/db";
import { scopedDb, stampScope } from "@/mocks/scope";
import type { VendorEntity } from "@/types/domain";
import type { CreateVendorInput, UpdateVendorInput, VendorApi, VendorView } from "./contract";

function toView(row: VendorEntity): VendorView {
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    npwp: row.npwp,
    address: row.address,
    phone: row.phone,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getVendors(): Promise<VendorView[]> {
  await latency("read");
  return scopedDb().vendors.map(toView).sort((a, b) => a.name.localeCompare(b.name));
}

async function createVendor(input: CreateVendorInput): Promise<VendorView> {
  await latency("write");
  if (!input.code.trim()) throw new ApiError("Kode wajib diisi.", 422);
  if (!input.name.trim()) throw new ApiError("Nama wajib diisi.", 422);

  return mutate((db) => {
    if (db.vendors.some((v) => v.code === input.code.trim())) {
      throw new ApiError("Vendor dengan kode ini sudah ada.", 409, "DUPLICATE");
    }
    const now = new Date().toISOString();
    const row: VendorEntity = stampScope({
      id: nextId("vnd"),
      code: input.code.trim(),
      name: input.name.trim(),
      npwp: input.npwp?.trim() || undefined,
      address: input.address?.trim() || undefined,
      phone: input.phone?.trim() || undefined,
      status: "atv",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    db.vendors.push(row);
    return toView(row);
  });
}

async function updateVendor(input: UpdateVendorInput): Promise<VendorView> {
  await latency("write");
  return mutate((db) => {
    const row = db.vendors.find((v) => v.id === input.id);
    if (!row) throw new ApiError("Vendor tidak ditemukan.", 404);
    if (row.version !== input.version) {
      throw new ApiError("Vendor sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new ApiError("Nama wajib diisi.", 422);
      row.name = input.name.trim();
    }
    if (input.npwp !== undefined) row.npwp = input.npwp.trim() || undefined;
    if (input.address !== undefined) row.address = input.address.trim() || undefined;
    if (input.phone !== undefined) row.phone = input.phone.trim() || undefined;
    if (input.status !== undefined) row.status = input.status;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toView(row);
  });
}

/**
 * Soft-deletes -- mirrors the real backend's own DeleteRow. Nothing refuses
 * this when core.purchases rows already reference the vendor; a purchase
 * keeps its own `supplierId` regardless, the same way a deleted bank
 * account doesn't orphan a posted voucher.
 */
async function deleteVendor(id: string): Promise<void> {
  await latency("write");
  mutate((db) => {
    const row = db.vendors.find((v) => v.id === id);
    if (!row) throw new ApiError("Vendor tidak ditemukan.", 404);
    db.vendors = db.vendors.filter((v) => v.id !== id);
  });
}

export const vendorApiMock: VendorApi = { getVendors, createVendor, updateVendor, deleteVendor };
