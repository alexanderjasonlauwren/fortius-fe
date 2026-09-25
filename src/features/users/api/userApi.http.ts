/**
 * Users, against the real API.
 *
 * This file is also where the language boundary lives. The backend speaks
 * English and matches its own schema; the UI domain model is Indonesian
 * (`nama`, `telepon`, `cabang`). Mapping here rather than renaming either side
 * keeps the backend consistent with its published contract and leaves every
 * component untouched — see technical-gaps 2.4, which chose this direction.
 */
import { getList, getOne, send } from "@/lib/api";
import type { UserEntity, UserStatusEntity } from "@/types/domain";
import type { UserFilters, UsersApi } from "./contract";
import type { UserRole } from "@/types/auth";

/** What the API returns. Mirrors the backend's UserResponse exactly. */
interface UserResponse {
  id: string;
  username: string;
  email?: string;
  full_name: string;
  phone?: string;
  avatar_url?: string;
  status: string;
  last_login_at?: string;
  roles?: UserRoleAssignmentResponse[];
  version: number;
  created_at: string;
  updated_at: string;
}

interface UserRoleAssignmentResponse {
  code: string;
  name: string;
  scope_type: "global" | "tenant" | "subtree" | "branch" | "outlet";
  branch_id?: string;
  branch_name?: string;
}

const ROLE_CODES: Record<UserEntity["role"], readonly string[]> = {
  admin: ["super_admin", "tenant_admin"],
  manager: ["ops_manager"],
  finance: ["finance_officer"],
  staff: ["dispatcher", "warehouse_staff"],
  viewer: ["auditor_viewer"],
  driver: ["driver"],
};

const ROLE_BY_CODE = new Map(
  Object.entries(ROLE_CODES).flatMap(([role, codes]) =>
    codes.map((code) => [code, role as UserEntity["role"]] as const),
  ),
);

const ROLE_PRIORITY: readonly UserEntity["role"][] = [
  "admin",
  "manager",
  "finance",
  "staff",
  "viewer",
  "driver",
];

/**
 * Status codes are three letters on the wire — `atv`, `ina`, `del` — because
 * the column is CHAR(3). The UI shows words.
 */
const STATUS_TO_DOMAIN: Record<string, UserStatusEntity> = {
  atv: "Aktif",
  ina: "Nonaktif",
  del: "Nonaktif",
};

function toDomain(row: UserResponse): UserEntity {
  const assignments = row.roles ?? [];
  const roleCodes = [...new Set(assignments.map((assignment) => assignment.code))];
  const roleNames = [...new Set(assignments.map((assignment) => assignment.name))];
  const categories = new Set(
    roleCodes.flatMap((code) => {
      const category = ROLE_BY_CODE.get(code);
      return category ? [category] : [];
    }),
  );
  const primaryRole = ROLE_PRIORITY.find((candidate) => categories.has(candidate)) ?? "viewer";
  const tenantWide = assignments.some(({ scope_type }) =>
    ["global", "tenant", "subtree"].includes(scope_type),
  );
  const branchIds = [
    ...new Set(assignments.flatMap(({ branch_id }) => (branch_id ? [branch_id] : []))),
  ];
  const branchNames = [
    ...new Set(assignments.flatMap(({ branch_name }) => (branch_name ? [branch_name] : []))),
  ];

  return {
    id: row.id,
    nama: row.full_name,
    email: row.email ?? "",
    role: primaryRole as UserRole as UserEntity["role"],
    roleCodes,
    roleNames,
    telepon: row.phone ?? "",
    cabang: assignments.length === 0 ? "" : tenantWide ? "Semua cabang" : branchNames.join(", "),
    branchIds,
    scopeType: tenantWide
      ? "tenant"
      : assignments.some(({ scope_type }) => scope_type === "branch")
        ? "branch"
        : assignments.some(({ scope_type }) => scope_type === "outlet")
          ? "outlet"
          : "tenant",
    status: STATUS_TO_DOMAIN[row.status] ?? "Nonaktif",
    terakhirMasuk: row.last_login_at,
    dibuatPada: row.created_at,
  };
}

export async function getUsers(filters?: UserFilters): Promise<UserEntity[]> {
  const page = await getList<UserResponse>("/users", {
    search: filters?.search,
    pageSize: 100,
  });
  return page.items.map(toDomain);
}

export async function getUsersWithAccess(filters?: UserFilters): Promise<UserEntity[]> {
  const roleCodes =
    filters?.role && filters.role !== "Semua" ? ROLE_CODES[filters.role] : undefined;
  const page = await getList<UserResponse>("/users/access", {
    search: filters?.search,
    pageSize: 100,
    filters: roleCodes
      ? [{ field: "role_code", operator: "in", value: roleCodes.join(",") }]
      : [],
  });
  return page.items.map(toDomain);
}

export async function createOrUpdateUser(
  input: Partial<UserEntity> & { id?: string },
): Promise<UserEntity> {
  const body = {
    username: input.email?.split("@")[0] ?? input.nama,
    full_name: input.nama,
    email: input.email,
    phone: input.telepon || undefined,
  };

  if (input.id) {
    // Read first for the version. The server refuses a write whose version does
    // not match the row, so a form opened five minutes ago cannot silently
    // overwrite someone else's edit — it gets 409 STALE_VERSION instead.
    const current = await getOne<UserResponse>(`/users/${input.id}`);
    const updated = await send<UserResponse>("put", `/users/${input.id}`, {
      ...body,
      version: current.version,
    });
    return toDomain(updated);
  }
  return toDomain(await send<UserResponse>("post", "/users", body));
}

export async function removeUser(id: string): Promise<void> {
  await send<null>("delete", `/users/${id}`);
}

// Compile-time proof that this adapter satisfies the contract. Without it a
// drifting signature is discovered by a page that fails to build, or worse by
// one that builds and reads a field that is not there.
const _contract: UsersApi = { getUsers, getUsersWithAccess, createOrUpdateUser, removeUser };
void _contract;
