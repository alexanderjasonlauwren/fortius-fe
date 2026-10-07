/**
 * Registration package templates, against the mock database.
 */
import { ApiError, latency, mutate, nextId } from "@/mocks/db";
import { scopedDb, stampScope } from "@/mocks/scope";
import type { RegistrationPackageEntity } from "@/types/domain";
import type {
  CreateRegistrationPackageInput,
  RegistrationPackage,
  RegistrationPackageApi,
  RegistrationPackageItem,
  UpdateRegistrationPackageInput,
} from "./contract";

function toView(row: RegistrationPackageEntity): RegistrationPackage {
  const db = scopedDb();
  const items: RegistrationPackageItem[] = row.items.map((i) => {
    const product = db.products.find((p) => p.id === i.productId);
    return {
      productId: i.productId,
      productCode: product?.kode ?? "",
      productName: product?.nama ?? "",
      qty: i.qty,
    };
  });
  return {
    id: row.id,
    name: row.name,
    feeAmount: row.feeAmount,
    isDefault: row.isDefault,
    isActive: row.isActive,
    items,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

function validateItems(db: ReturnType<typeof scopedDb>, items: { productId: string; qty: number }[] | undefined) {
  for (const item of items ?? []) {
    if (item.qty <= 0) throw new ApiError("Qty kit item harus lebih dari nol.", 422);
    const product = db.products.find((p) => p.id === item.productId);
    if (!product) throw new ApiError("Produk kit tidak ditemukan.", 400);
    if (product.productKind !== "accessory") {
      throw new ApiError(`"${product.nama}" bukan produk aksesori/perlengkapan.`, 422);
    }
  }
}

async function listPackages(): Promise<RegistrationPackage[]> {
  await latency("read");
  return scopedDb().registrationPackages.map(toView).sort((a, b) => a.name.localeCompare(b.name));
}

async function getPackage(id: string): Promise<RegistrationPackage> {
  await latency("read");
  const row = scopedDb().registrationPackages.find((p) => p.id === id);
  if (!row) throw new ApiError("Paket tidak ditemukan.", 404);
  return toView(row);
}

async function createPackage(input: CreateRegistrationPackageInput): Promise<RegistrationPackage> {
  await latency("write");
  if (!input.name.trim()) throw new ApiError("Nama paket wajib diisi.", 422);
  if (input.feeAmount <= 0) throw new ApiError("Nilai pendaftaran harus lebih dari nol.", 422);
  validateItems(scopedDb(), input.items);

  return mutate((db) => {
    if (input.isDefault) {
      for (const p of db.registrationPackages) p.isDefault = false;
    }
    const now = new Date().toISOString();
    const row: RegistrationPackageEntity = stampScope({
      id: nextId("regpkg"),
      name: input.name.trim(),
      feeAmount: input.feeAmount,
      isDefault: input.isDefault ?? false,
      isActive: true,
      items: (input.items ?? []).map((i) => ({ productId: i.productId, qty: i.qty })),
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    db.registrationPackages.push(row);
    return toView(row);
  });
}

async function updatePackage(input: UpdateRegistrationPackageInput): Promise<RegistrationPackage> {
  await latency("write");
  if (!input.name.trim()) throw new ApiError("Nama paket wajib diisi.", 422);
  if (input.feeAmount <= 0) throw new ApiError("Nilai pendaftaran harus lebih dari nol.", 422);
  validateItems(scopedDb(), input.items);

  return mutate((db) => {
    const row = db.registrationPackages.find((p) => p.id === input.id);
    if (!row) throw new ApiError("Paket tidak ditemukan.", 404);
    if (row.version !== input.version) {
      throw new ApiError("Paket sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    if (input.isDefault) {
      for (const p of db.registrationPackages) if (p.id !== row.id) p.isDefault = false;
    }
    row.name = input.name.trim();
    row.feeAmount = input.feeAmount;
    row.isDefault = input.isDefault;
    row.isActive = input.isActive;
    if (input.items !== undefined) {
      row.items = input.items.map((i) => ({ productId: i.productId, qty: i.qty }));
    }
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toView(row);
  });
}

export const registrationPackageApiMock: RegistrationPackageApi = {
  listPackages,
  getPackage,
  createPackage,
  updatePackage,
};
