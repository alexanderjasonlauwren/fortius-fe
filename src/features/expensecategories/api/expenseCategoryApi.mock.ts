/**
 * Expense categories, against the mock database.
 */
import { ApiError, latency, mutate, nextId } from "@/mocks/db";
import { scopedDb, stampScope } from "@/mocks/scope";
import type { ExpenseCategoryEntity } from "@/types/domain";
import type {
  CreateExpenseCategoryInput,
  ExpenseCategoryApi,
  ExpenseCategoryView,
  UpdateExpenseCategoryInput,
} from "./contract";

function toView(row: ExpenseCategoryEntity, db: ReturnType<typeof scopedDb>): ExpenseCategoryView {
  const account = db.accounts.find((a) => a.id === row.accountId);
  return {
    id: row.id,
    code: row.code,
    name: row.name,
    accountId: row.accountId,
    accountCode: account?.kode ?? "",
    accountName: account?.nama ?? "",
    groupLabel: row.groupLabel,
    sortOrder: row.sortOrder,
    status: row.status,
    version: row.version,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
  };
}

async function getExpenseCategories(): Promise<ExpenseCategoryView[]> {
  await latency("read");
  const db = scopedDb();
  return db.expenseCategories
    .map((row) => toView(row, db))
    .sort((a, b) => a.sortOrder - b.sortOrder || a.name.localeCompare(b.name));
}

async function createExpenseCategory(input: CreateExpenseCategoryInput): Promise<ExpenseCategoryView> {
  await latency("write");
  if (!input.code.trim()) throw new ApiError("Kode wajib diisi.", 422);
  if (!input.name.trim()) throw new ApiError("Nama wajib diisi.", 422);
  if (!input.groupLabel.trim()) throw new ApiError("Kelompok wajib diisi.", 422);

  return mutate((db) => {
    if (db.expenseCategories.some((c) => c.code === input.code.trim())) {
      throw new ApiError("Kategori dengan kode ini sudah ada.", 409, "DUPLICATE");
    }
    const account = db.accounts.find((a) => a.id === input.accountId);
    if (!account) throw new ApiError("Akun tidak ditemukan.", 400);

    const now = new Date().toISOString();
    const row: ExpenseCategoryEntity = stampScope({
      id: nextId("expcat"),
      code: input.code.trim(),
      name: input.name.trim(),
      accountId: input.accountId,
      groupLabel: input.groupLabel.trim(),
      sortOrder: input.sortOrder ?? db.expenseCategories.length,
      status: "atv",
      version: 1,
      createdAt: now,
      updatedAt: now,
    });
    db.expenseCategories.push(row);
    return toView(row, scopedDb());
  });
}

async function updateExpenseCategory(input: UpdateExpenseCategoryInput): Promise<ExpenseCategoryView> {
  await latency("write");
  return mutate((db) => {
    const row = db.expenseCategories.find((c) => c.id === input.id);
    if (!row) throw new ApiError("Kategori tidak ditemukan.", 404);
    if (row.version !== input.version) {
      throw new ApiError("Kategori sudah berubah. Muat ulang lalu coba lagi.", 409, "STALE_VERSION");
    }
    if (input.name !== undefined) {
      if (!input.name.trim()) throw new ApiError("Nama wajib diisi.", 422);
      row.name = input.name.trim();
    }
    if (input.accountId !== undefined) {
      const account = db.accounts.find((a) => a.id === input.accountId);
      if (!account) throw new ApiError("Akun tidak ditemukan.", 400);
      row.accountId = input.accountId;
    }
    if (input.groupLabel !== undefined) {
      if (!input.groupLabel.trim()) throw new ApiError("Kelompok wajib diisi.", 422);
      row.groupLabel = input.groupLabel.trim();
    }
    if (input.sortOrder !== undefined) row.sortOrder = input.sortOrder;
    if (input.status !== undefined) row.status = input.status;
    row.version += 1;
    row.updatedAt = new Date().toISOString();
    return toView(row, scopedDb());
  });
}

/**
 * Soft-deletes -- the row stops appearing in any future list, the same way
 * the real backend's own DeleteRow (deleted_at) does. Distinct from
 * `updateExpenseCategory({status: "ina"})`, which keeps the row listed but
 * deactivated; nothing refuses this when core.expenses rows already
 * reference the code -- the FK is on (tenant_id, category), not on this
 * row's id -- mirroring the real backend's own comment on exactly this.
 */
async function deleteExpenseCategory(id: string): Promise<void> {
  await latency("write");
  mutate((db) => {
    const row = db.expenseCategories.find((c) => c.id === id);
    if (!row) throw new ApiError("Kategori tidak ditemukan.", 404);
    db.expenseCategories = db.expenseCategories.filter((c) => c.id !== id);
  });
}

export const expenseCategoryApiMock: ExpenseCategoryApi = {
  getExpenseCategories,
  createExpenseCategory,
  updateExpenseCategory,
  deleteExpenseCategory,
};
