/**
 * What every users adapter must provide.
 *
 * The contract exists so the two implementations cannot drift. Without it the
 * mock returned a domain `UserEntity` and the HTTP adapter returned the wire
 * shape, and the build broke only in the pages that happened to read a field
 * present in one and not the other — which is the failure this whole pattern is
 * meant to prevent.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter: mapping there is what keeps every component unaware of which source
 * it is running against.
 */
import type { UserEntity, UserStatusEntity } from "@/types/domain";

export interface UserFilters {
  search?: string;
  role?: UserEntity["role"] | "Semua";
  status?: UserStatusEntity | "Semua";
}

export interface UsersApi {
  getUsers(filters?: UserFilters): Promise<UserEntity[]>;
  getUsersWithAccess(filters?: UserFilters): Promise<UserEntity[]>;
  createOrUpdateUser(input: Partial<UserEntity> & { id?: string }): Promise<UserEntity>;
  removeUser(id: string): Promise<void>;
}
