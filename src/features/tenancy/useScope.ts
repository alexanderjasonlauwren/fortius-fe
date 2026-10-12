import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQueryClient } from "@tanstack/react-query";
import { setActiveScope, subtreeOf } from "@/lib/scope";
import { branchRegistry, setBranchRegistry, tenantRegistry } from "./tenantRegistry";
import { useAuthStore } from "@/features/auth/store/authStore";

/** "semua" in the URL means the consolidated, cross-branch view. */
export const ALL_BRANCHES = "semua";

/**
 * Active tenant and branch, both held in the URL.
 *
 * The URL is the source of truth so a pasted link opens the same records for a
 * colleague — the property that decides whether "look at this surat jalan" is a
 * useful message or a confusing one.
 *
 * Tenant used to be absent here, on the grounds that it came from the session
 * and could not change. It can now, and it matters more than branch does: a
 * link that quietly opens a DIFFERENT subsidiary's records is worse than one
 * that opens nothing, because it looks like it worked.
 */
export function useScope() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // --- tenant -------------------------------------------------------------
  const allTenants = tenantRegistry();
  const tenants = useMemo(() => allTenants.filter((t) => t.aktif), [allTenants]);
  const rootTenant = useMemo(
    () => tenants.find((t) => t.indukId === null) ?? tenants[0] ?? null,
    [tenants],
  );

  const rawTenant = params.get("tenant");
  // An unknown tenant in the URL falls back to the root rather than showing an
  // empty console: a stale bookmark from before a tenant was deactivated should
  // land somewhere real and explain itself, not look like an outage.
  const actingTenant =
    tenants.find((t) => t.id === rawTenant || t.kode === rawTenant) ?? rootTenant;
  const actingTenantId = actingTenant?.id ?? "";

  const visibleTenantIds = useMemo(
    () => (actingTenantId ? subtreeOf(tenants, actingTenantId) : []),
    [tenants, actingTenantId],
  );

  // --- branch -------------------------------------------------------------
  // The session tenant's branches, already scoped by row-level security.
  const allBranches = branchRegistry();
  const branches = useMemo(() => allBranches.filter((b) => b.aktif), [allBranches]);

  // Which branches this user may read. Empty means every branch.
  const allowedBranchIds = useMemo(
    () => user?.branchIds ?? [],
    [user?.branchIds],
  );
  const canSeeAll = allowedBranchIds.length === 0 || allowedBranchIds.length > 1;

  const visibleBranches = useMemo(
    () =>
      allowedBranchIds.length === 0
        ? branches
        : branches.filter((b) => allowedBranchIds.includes(b.id)),
    [branches, allowedBranchIds],
  );

  const raw = params.get("cabang");
  const fallback =
    visibleBranches.find((b) => b.utama)?.id ?? visibleBranches[0]?.id ?? null;

  // An unknown or disallowed branch in the URL falls back rather than showing
  // an empty console with no explanation.
  const branchId =
    raw === ALL_BRANCHES && canSeeAll
      ? null
      : (visibleBranches.find((b) => b.id === raw || b.kode === raw)?.id ??
        fallback);

  const scope = useMemo(
    () => ({ actingTenantId, visibleTenantIds, branchId, allowedBranchIds }),
    [actingTenantId, visibleTenantIds, branchId, allowedBranchIds],
  );

  // Request paths and query keys read scope synchronously, so it must be set
  // before any query function runs.
  setActiveScope(scope);

  const setBranch = useCallback(
    (next: string | null) => {
      const value = next === null ? ALL_BRANCHES : next;

      // Order matters: clearing the cache triggers an immediate refetch, and
      // those queries read the scope synchronously. Set it before clearing, or
      // the refetch runs against the branch we just left.
      setActiveScope({
        actingTenantId,
        visibleTenantIds,
        branchId: next,
        allowedBranchIds,
      });

      const params = new URLSearchParams(window.location.search);
      params.set("cabang", value);
      setParams(params, { replace: false });
      queryClient.clear();
    },
    [setParams, queryClient, actingTenantId, visibleTenantIds, allowedBranchIds],
  );

  /**
   * Move to another tenant.
   *
   * Branch is deliberately reset rather than carried over: branch ids belong to
   * a tenant, so keeping one across a switch would either resolve to nothing or,
   * worse, to a different tenant's branch that happened to share an id. The new
   * tenant's own default is the only sensible landing place.
   *
   * Against the real backend this is also where `POST /auth/switch-tenant` goes
   * — the acting tenant is a signed claim there, so it changes by re-issuing the
   * session rather than by editing a query parameter.
   */
  const setTenant = useCallback(
    (nextTenantId: string) => {
      const nextVisible = subtreeOf(tenants, nextTenantId);

      // The previous tenant's branches are meaningless now; the layout's
      // branch query refetches after the cache clear below, and the fallback
      // lands on the new tenant's default branch once it arrives.
      setBranchRegistry([]);

      // Same ordering rule as setBranch: the cache clear triggers an immediate
      // refetch and those queries read the scope synchronously, so the scope
      // has to be right before the cache is emptied.
      setActiveScope({
        actingTenantId: nextTenantId,
        visibleTenantIds: nextVisible,
        branchId: null,
        allowedBranchIds,
      });

      const params = new URLSearchParams(window.location.search);
      params.set("tenant", nextTenantId);
      params.delete("cabang");
      setParams(params, { replace: false });
      queryClient.clear();
    },
    [setParams, queryClient, tenants, allowedBranchIds],
  );

  // Keep the URL explicit, so a link always carries its full scope. The
  // branch is written only once branches have loaded: before that the
  // fallback is "consolidated", and pinning it would stop the default branch
  // from ever being chosen.
  const branchesLoaded = allBranches.length > 0;
  useEffect(() => {
    if (raw && rawTenant) return;
    if (!actingTenantId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tenant", actingTenantId);
    if (raw || branchesLoaded) params.set("cabang", branchId ?? ALL_BRANCHES);
    setParams(params, { replace: true });
  }, [raw, rawTenant, actingTenantId, branchId, branchesLoaded, setParams]);

  return {
    /** The tenant writes land in. */
    tenant: actingTenant,
    /** Every tenant the switcher may offer. */
    tenants,
    /** The acting tenant and its descendants — what reads may see. */
    visibleTenantIds,
    canSwitchTenant: tenants.length > 1,
    setTenant,

    branches: visibleBranches,
    branchId,
    branch: visibleBranches.find((b) => b.id === branchId) ?? null,
    isConsolidated: branchId === null,
    canSeeAll,
    setBranch,

    /** Prefix for every query key, so caches never bleed across scopes. */
    key: [actingTenantId, branchId ?? ALL_BRANCHES] as const,
  };
}
