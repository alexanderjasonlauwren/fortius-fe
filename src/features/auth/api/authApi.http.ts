/**
 * Authentication, against the real API.
 *
 * Login is deliberately two requests. `POST /auth/login` answers with tokens
 * and nothing else — no user, no permissions — because the token has to be
 * stored before anything can be read with it. `GET /profile` then answers who
 * the caller is and what they may do, using the token just stored.
 *
 * Permissions are read here rather than decoded from the JWT on purpose. A
 * token is valid until it expires, so grants baked into one would keep
 * authorising a role that had been revoked minutes ago. The server re-resolves
 * them per request; this reads the same tables at the same moment, so what the
 * console draws and what the server will allow come from one source.
 */
import { exchangeSession, getOne, send } from "@/lib/api";
import { getRefreshToken, setSessionTokens, type SessionTokens } from "@/lib/tokens";
import type { User } from "@/types/auth";
import type { AuthApi, SessionResult, SessionTenant, SwitchableTenant } from "./contract";

/** Mirrors the backend's user.LoginResponse. */
interface LoginResponse extends SessionTokens {
  token: string;
  refresh_token: string;
  expires_at: string;
  refresh_expires_at: string;
}

/** Mirrors the backend's user.SessionResponse. */
interface SessionResponse {
  user: {
    id: string;
    username: string;
    email?: string;
    full_name: string;
    phone?: string;
    avatar_url?: string;
    status: string;
  };
  tenant: { tenant_id: string; code: string; name: string };
  roles: string[];
  permissions: { code: string; tenant_wide: boolean }[];
}

/** Mirrors the backend's user.SwitchableTenant. */
interface SwitchableTenantRow {
  tenant_id: string;
  code: string;
  name: string;
  depth: number;
  via_membership: boolean;
}

function toDomain(row: SessionResponse): SessionResult {
  const user: User = {
    id: row.user.id,
    email: row.user.email ?? "",
    name: row.user.full_name,
    // Real role names now, from GET /profile. This used to be a hardcoded
    // placeholder because the endpoint did not return them and the console
    // insisted on exactly one — so every API user was labelled "staff".
    roles: row.roles ?? [],
    // Every held code, whatever its scope. A branch-scoped grant still means
    // "show me this screen" — it is the action inside that is narrower, and the
    // server is what refuses it. Filtering to tenant-wide here would hide a
    // branch dispatcher's own work from them.
    permissions: row.permissions.map((p) => p.code),
    phone: row.user.phone,
    avatar: row.user.avatar_url,
    scopeType: row.permissions.some((p) => p.tenant_wide) ? "tenant" : "branch",
  };

  const tenant: SessionTenant | null = row.tenant?.tenant_id
    ? { id: row.tenant.tenant_id, code: row.tenant.code, name: row.tenant.name }
    : null;

  return { user, tenant, token: "" };
}

async function readSession(token: string): Promise<SessionResult> {
  const row = await getOne<SessionResponse>("/profile");
  return { ...toDomain(row), token };
}

export const authApiHttp: AuthApi = {
  async login(email: string, password: string): Promise<SessionResult> {
    // The backend field is `username`, and it accepts an email in it. Named
    // `email` throughout the console because that is what the login form asks
    // for; renaming either side to match would be churn in the wrong place.
    const tokens = await send<LoginResponse>("post", "/auth/login", {
      username: email.trim(),
      password,
    });

    // Stored before the profile read, not after: the request interceptor reads
    // the token from here, so a profile fetch before this line goes out
    // unauthenticated and answers 401.
    setSessionTokens(tokens);

    return readSession(tokens.token);
  },

  async session(): Promise<SessionResult> {
    const token = localStorage.getItem("auth_token");
    if (!token) throw new Error("Sesi tidak ditemukan. Silakan masuk kembali.");
    return readSession(token);
  },

  async logout(): Promise<void> {
    const refresh = getRefreshToken();
    if (!refresh) return;
    try {
      await send<null>("post", "/auth/logout", { refresh_token: refresh });
    } catch {
      // Deliberately swallowed. The server may have expired or revoked this
      // session already, and a logout that fails because the session is
      // already gone has succeeded at the only thing the user wanted. The
      // caller clears local tokens either way.
    }
  },

  async listSwitchableTenants(): Promise<SwitchableTenant[]> {
    const rows = await getOne<SwitchableTenantRow[]>("/auth/switchable-tenants");
    return rows.map((row) => ({
      id: row.tenant_id,
      code: row.code,
      name: row.name,
      level: row.depth,
      viaMembership: row.via_membership,
    }));
  },

  async switchTenant(tenantId: string): Promise<SessionResult> {
    const token = await exchangeSession<LoginResponse>("/auth/switch-tenant", (refreshToken) => ({
      refresh_token: refreshToken,
      tenant_id: tenantId,
    }));
    // The permission set is per tenant, so it is re-read rather than carried
    // over: a role held at home may not exist in the subsidiary at all.
    return readSession(token);
  },
};
