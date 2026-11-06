/**
 * What every users adapter must provide.
 *
 * The domain shape screens read; the HTTP adapter maps the wire onto it.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter.
 */
import type { UserEntity, UserStatusEntity } from "@/types/domain";

export interface UserFilters {
  search?: string;
  role?: UserEntity["role"] | "Semua";
  status?: UserStatusEntity | "Semua";
}

/** A role the acting tenant may grant (never super_admin). */
export interface GrantableRole {
  id: string;
  code: string;
  name: string;
  isSystem: boolean;
}

/** One role a user holds in the acting tenant. */
export interface RoleGrant {
  id: string;
  roleId: string;
  roleCode: string;
  roleName: string;
  scope: "tenant" | "subtree" | "branch";
  branchId?: string;
  branchName?: string;
}

export interface UsersApi {
  getUsers(filters?: UserFilters): Promise<UserEntity[]>;
  getUsersWithAccess(filters?: UserFilters): Promise<UserEntity[]>;
  /** `password` is the initial one, required by the server on create only. */
  createOrUpdateUser(input: Partial<UserEntity> & { id?: string; password?: string }): Promise<UserEntity>;
  removeUser(id: string): Promise<void>;
  listGrantableRoles(): Promise<GrantableRole[]>;
  getUserRoles(userId: string): Promise<RoleGrant[]>;
  /**
   * The server refuses a role carrying permissions the grantor lacks
   * (ESCALATION), a change to one's own roles (SELF_GRANT) and removing the
   * last tenant administrator (LAST_ADMIN), each with a sentence to show.
   */
  grantRole(userId: string, input: { roleId: string; scope: "tenant" | "branch"; branchId?: string }): Promise<RoleGrant>;
  revokeRole(userId: string, grantId: string): Promise<void>;
}
