/**
 * The seeded role codes, for the users list's role column and its summaries.
 *
 * NOT the session's model of authority. A signed-in user carries `roles` — a
 * list, because the backend allows several and has no `role` column on
 * iam.users to read — and nothing branches on those names. What a person may
 * do is `permissions`, resolved per request by the server from iam.user_roles.
 * A tenant's own role, outside this list, shows its code as stored.
 */
export type UserRole =
  | "admin"
  | "manager"
  | "finance"
  | "driver"
  | "staff"
  | "viewer";

export interface User {
  id: string;
  email: string;
  name: string;
  /**
   * What this person is CALLED in the tenant they are acting in, for display.
   *
   * Several, because a person can hold several. The console modelled one and
   * had to pick, so a user who was both Finance and Dispatcher appeared as
   * whichever the code happened to read — and against the API there was no
   * honest answer at all, so the adapter returned a fixed placeholder.
   *
   * Never branch on these. `permissions` is the authority, and a role renamed
   * in the database must not change what the software permits.
   */
  roles: string[];
  permissions: string[];
  avatar?: string;
  branch?: string;
  /** Branches this user may read. Empty = every branch (tenant-wide scope). */
  branchIds?: string[];
  /** Mirrors iam.user_roles.scope_type on the backend. */
  scopeType?: "global" | "tenant" | "branch" | "outlet";
  phone?: string;
  /** Set for `driver` accounts: the fleet record this user drives. */
  driverId?: string;
}

export interface AuthResponse {
  user: User;
  token: string;
}
