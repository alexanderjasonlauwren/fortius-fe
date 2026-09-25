import { scopedDb } from "@/mocks/scope";
import { latency } from "@/mocks/db";
import { deleteUser, saveUser } from "@/mocks/rules";
import { exportCsv, timestampSuffix } from "@/lib/export";
import type { UserEntity, UserStatusEntity } from "@/mocks/types";
import type { UserRole } from "@/types/auth";
import type { UserFilters, UsersApi } from "./contract";

/** What each role may do, shown on the access page so it is not a mystery. */
// Keyed on the full role union so anything holding a UserRole can label it.
export const ROLE_SUMMARY: Record<UserRole, string> = {
  admin: "Akses penuh, termasuk pengaturan sistem dan manajemen pengguna.",
  manager: "Menyetujui pesanan, mengonfirmasi rencana, dan membaca semua laporan.",
  finance: "Memverifikasi pembayaran, meninjau kwitansi, dan mengunduh laporan keuangan.",
  staff: "Menyusun rencana distribusi dan memperbarui status pengiriman.",
  viewer: "Hanya membaca. Tidak dapat mengubah data apa pun.",
  driver: "Akses lapangan: melihat rute dan memperbarui status pengiriman miliknya.",
};

export const ROLE_LABEL: Record<UserRole, string> = {
  admin: "Admin",
  manager: "Manajer",
  finance: "Keuangan",
  staff: "Staf Operasional",
  viewer: "Peninjau",
  driver: "Driver",
};

export async function getUsers(filters?: {
  search?: string;
  role?: UserEntity["role"] | "Semua";
  status?: UserStatusEntity | "Semua";
}): Promise<UserEntity[]> {
  await latency("read");
  return scopedDb()
    .users.filter((u) => {
      if (filters?.role && filters.role !== "Semua" && u.role !== filters.role) return false;
      if (filters?.status && filters.status !== "Semua" && u.status !== filters.status)
        return false;
      if (filters?.search) {
        const q = filters.search.toLowerCase();
        return (
          u.nama.toLowerCase().includes(q) ||
          u.email.toLowerCase().includes(q) ||
          u.cabang.toLowerCase().includes(q)
        );
      }
      return true;
    })
    .sort((a, b) => a.nama.localeCompare(b.nama));
}

const MOCK_ROLE_CODES: Record<UserRole, string> = {
  admin: "tenant_admin",
  manager: "ops_manager",
  finance: "finance_officer",
  staff: "warehouse_staff",
  viewer: "auditor_viewer",
  driver: "driver",
};

export async function getUsersWithAccess(filters?: UserFilters): Promise<UserEntity[]> {
  const users = await getUsers(filters);
  return users.map((user) => ({
    ...user,
    roleCodes: user.roleCodes ?? [MOCK_ROLE_CODES[user.role]],
    roleNames: user.roleNames ?? [ROLE_LABEL[user.role]],
  }));
}

export async function createOrUpdateUser(input: Partial<UserEntity> & { id?: string }) {
  await latency("write");
  return saveUser(input);
}

export async function removeUser(id: string) {
  await latency("write");
  deleteUser(id);
}

export async function exportUsers() {
  await latency("read");
  const rows = await getUsers();
  exportCsv(
    `pengguna-${timestampSuffix()}`,
    ["Nama", "Email", "Peran", "Telepon", "Cabang", "Status", "Terakhir Masuk"],
    rows.map((u) => [
      u.nama,
      u.email,
      ROLE_LABEL[u.role],
      u.telepon,
      u.cabang,
      u.status,
      u.terakhirMasuk ? new Date(u.terakhirMasuk).toLocaleString("id-ID") : "Belum pernah",
    ]),
  );
  return rows.length;
}

/** Audit trail, filtered to one actor or entity when asked. */
export async function getAuditTrail(filters?: {
  actor?: string;
  entity?: string;
  limit?: number;
}) {
  await latency("read");
  return scopedDb()
    .audit.filter((a) => {
      if (filters?.actor && a.actor !== filters.actor) return false;
      if (filters?.entity && a.entity !== filters.entity) return false;
      return true;
    })
    .slice(0, filters?.limit ?? 100);
}

// The mock satisfies the same contract as the HTTP adapter. This assertion is
// what makes the two interchangeable rather than merely similarly named — it
// caught createOrUpdateUser returning different shapes from each side.
const _contract: UsersApi = { getUsers, getUsersWithAccess, createOrUpdateUser, removeUser };
void _contract;
