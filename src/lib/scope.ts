/**
 * Tenant and branch scope, readable synchronously.
 *
 * The backend enforces tenancy with row-level security; the console only needs
 * the active scope to build request paths and to prefix query keys so caches
 * never bleed across tenants or branches. `useScope` sets it during render,
 * before any child query runs.
 *
 * Reads travel down the tree, writes do not: `visibleTenantIds` is what a group
 * can see, `actingTenantId` is the one tenant its writes land in — mirroring
 * `USING (tenant_id = ANY (visible_tenant_ids()))` against
 * `WITH CHECK (tenant_id = current_tenant_id())`.
 */
import type { ID, TenantEntity } from "@/types/domain";

export interface ActiveScope {
  /** What writes are stamped with. Exactly one tenant, always. */
  actingTenantId: ID;
  /** The acting tenant and its descendants. Always contains `actingTenantId`. */
  visibleTenantIds: ID[];
  /** null = consolidated across every branch the user may see. */
  branchId: ID | null;
  /** Branches this user is allowed to read. Empty = all of them. */
  allowedBranchIds: ID[];
}

const EMPTY: ActiveScope = {
  actingTenantId: "",
  visibleTenantIds: [],
  branchId: null,
  allowedBranchIds: [],
};

let active: ActiveScope | null = null;

/**
 * Sets the active scope — except a regression to no acting tenant once a real
 * one has been set.
 *
 * `useScope` calls this on every render from the tenant registry, which can
 * read empty for an instant (an HMR reset, any transient emptiness between two
 * renders). A query that reads `getActingTenant()` during that instant fails
 * with "Tidak ada tenant aktif", and with `retry: 0` that failure is permanent.
 * Found live: SettingsPage hung on its skeleton forever. No real switch ever
 * names an empty tenant, so a blank incoming value is always the transient case.
 */
export function setActiveScope(scope: ActiveScope): void {
  if (!scope.actingTenantId && active?.actingTenantId) return;
  active = scope;
  // Scope bugs look exactly like stale data, so keep it inspectable while
  // developing. Guarded on `window`: the unit tests run under Node.
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__scope = scope;
  }
}

/** Empty until `useScope` has run in the layout. */
export function getActiveScope(): ActiveScope {
  return active ?? EMPTY;
}

/** Empty before the layout has resolved a scope. */
export function getActingTenant(): ID {
  return getActiveScope().actingTenantId;
}

/**
 * A tenant and every tenant beneath it — the client's view of
 * `public.visible_tenant_ids()`. Breadth-first and index-based on purpose:
 * pushing while iterating is what makes one pass reach every level.
 */
export function subtreeOf(tenants: TenantEntity[], rootId: ID): ID[] {
  const ids = [rootId];
  for (let i = 0; i < ids.length; i++) {
    for (const t of tenants) {
      if (t.indukId === ids[i] && !ids.includes(t.id)) ids.push(t.id);
    }
  }
  return ids;
}

/**
 * Query-key prefix for the active scope. A plain function rather than a hook so
 * every call site can use it without plumbing; switching scope clears the cache
 * outright.
 */
export function scopeKey(): readonly [string, string] {
  const scope = getActiveScope();
  return [scope.actingTenantId, scope.branchId ?? "semua"] as const;
}
