/**
 * The session, as the console sees it.
 *
 * This store used to *be* the authentication: it read the mock user table
 * directly, compared against a hardcoded demo password and minted a fake JWT.
 * That made the API build unable to log in at all, which in turn meant none of
 * the HTTP adapters behind it had ever run.
 *
 * Now it holds session state and delegates every I/O decision to `authApi`,
 * which is the mock or the real service depending on the build. The demo
 * behaves exactly as before — same password, same messages — because that
 * behaviour moved into `authApi.mock.ts` rather than being deleted.
 */
import { create } from "zustand";
import { persist } from "zustand/middleware";

import { authApi } from "@/features/auth/api/authApi";
import type { SessionTenant } from "@/features/auth/api/contract";
import type { User } from "@/types/auth";
import { clearSessionTokens } from "@/lib/tokens";

interface AuthState {
  user: User | null;
  token: string | null;
  isAuthenticated: boolean;
  /** The tenant this session acts as. Null against the mock, which has one. */
  tenant: SessionTenant | null;

  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  /**
   * Re-reads the session from the stored token.
   *
   * Called on app start. Permissions are deliberately not persisted across a
   * reload — see the comment on `partialize` below.
   */
  restore: () => Promise<void>;
  setUser: (user: User, token: string) => void;
  /**
   * Re-issues the session in another tenant. Resolves once the new user,
   * tenant and permissions are in the store; throws, leaving the session as it
   * was, when the server refuses.
   */
  switchTenant: (tenantId: string) => Promise<void>;
  hasPermission: (permission: string) => boolean;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set, get) => ({
      user: null,
      token: null,
      tenant: null,
      isAuthenticated: false,

      login: async (email: string, password: string) => {
        const { user, tenant, token } = await authApi.login(email, password);
        set({ user, tenant, token, isAuthenticated: true });
        // The HTTP adapter has already stored both tokens; the mock has no
        // real ones. Writing the access token here keeps the key populated for
        // the mock build, where some screens still read it directly.
        localStorage.setItem("auth_token", token);
      },

      restore: async () => {
        try {
          const { user, tenant, token } = await authApi.session();
          set({ user, tenant, token, isAuthenticated: true });
        } catch {
          // A session that cannot be re-read is not a session. Failing closed
          // here is what stops a persisted `isAuthenticated: true` from
          // outliving the token it was true for — which would render the whole
          // console to someone the server will answer 401 to on every request.
          clearSessionTokens();
          set({ user: null, tenant: null, token: null, isAuthenticated: false });
        }
      },

      logout: async () => {
        // Tell the server first, while the tokens still exist. POST
        // /auth/logout revokes the refresh token so it cannot be replayed
        // after the user walks away; clearing locally first would leave that
        // token alive on the server with nothing able to revoke it.
        await authApi.logout();

        // Both tokens. Clearing only the access token strands the refresh
        // token, and the next login would leave a usable session behind that
        // nobody can see or revoke from the UI.
        clearSessionTokens();
        set({ user: null, tenant: null, token: null, isAuthenticated: false });
      },

      setUser: (user: User, token: string) => {
        set({ user, token, isAuthenticated: true });
        localStorage.setItem("auth_token", token);
      },

      switchTenant: async (tenantId: string) => {
        const { user, tenant, token } = await authApi.switchTenant(tenantId);
        set({ user, tenant, token, isAuthenticated: true });
      },

      hasPermission: (permission: string) =>
        get().user?.permissions.includes(permission) ?? false,
    }),
    {
      name: "auth-storage",
      /**
       * Only enough to know a session is worth restoring.
       *
       * The permission set is deliberately NOT persisted. Grants live in the
       * database precisely so a revoked role stops authorising immediately; a
       * copy in localStorage would survive the revocation and keep drawing
       * menus for authority the user no longer has, until they happened to
       * clear their browser. `restore()` re-reads them on every load, which is
       * one request and the only way the two can agree.
       */
      partialize: (state) => ({
        token: state.token,
        isAuthenticated: state.isAuthenticated,
      }),
    },
  ),
);
