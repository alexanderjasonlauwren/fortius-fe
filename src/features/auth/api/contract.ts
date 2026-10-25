/**
 * What every auth adapter must provide.
 *
 * Same reason as `features/users/api/contract.ts`: without a contract the mock
 * and the HTTP adapter drift, and the drift only shows up in whichever screen
 * happens to read the field one of them forgot.
 *
 * **Adapters return domain types.** `SessionResult` is the console's shape, not
 * the wire's — the backend's `SessionResponse` never escapes the HTTP adapter.
 */
import type { User } from "@/types/auth";

/** The tenant a session is acting as. `id` is the public id, as on every tenant. */
export interface SessionTenant {
  id: string;
  code: string;
  name: string;
}

/** A tenant this user may switch the session into. */
export interface SwitchableTenant {
  id: string;
  code: string;
  name: string;
  /** Absolute depth from the root, as `TenantEntity.level`. */
  level: number;
  /**
   * False when the user reaches this tenant only through a subtree grant from
   * above: they are borrowing a group's authority, not working at home.
   */
  viaMembership: boolean;
}

export interface SessionResult {
  user: User;
  tenant: SessionTenant | null;
  /** The access token. Stored by the caller, not by the adapter. */
  token: string;
}

export interface AuthApi {
  /**
   * Exchanges credentials for a session.
   *
   * Returns the user and their permissions, which costs a second request
   * against the API: login answers with tokens only, and who-you-are comes from
   * the session endpoint. Both happen here so no caller has to know that.
   */
  login(email: string, password: string): Promise<SessionResult>;

  /**
   * Re-reads the current session from the stored token.
   *
   * Needed on every page load: the token survives a refresh in localStorage but
   * the permission set does not travel in it, deliberately — grants live in the
   * database so a revoked role stops authorising immediately rather than when
   * the token happens to expire.
   */
  session(): Promise<SessionResult>;

  /**
   * Ends the session server-side.
   *
   * Must not throw on a token the server has already forgotten: logging out is
   * how a user recovers from a broken session, so it has to work when the
   * session is broken.
   */
  logout(): Promise<void>;

  /** The tenants this session may switch into, the current one included. */
  listSwitchableTenants(): Promise<SwitchableTenant[]>;

  /**
   * Re-issues the session in another tenant and returns it.
   *
   * The acting tenant is a signed claim, so it changes only by exchanging the
   * refresh token for a new pair; a query parameter or a header naming the
   * tenant would be the client deciding what row-level security shows.
   */
  switchTenant(tenantId: string): Promise<SessionResult>;
}
