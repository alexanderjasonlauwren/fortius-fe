import { useCallback, useEffect, useMemo } from "react";
import { useSearchParams } from "react-router-dom";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { setActiveScope, subtreeOf } from "@/lib/scope";
import { branchRegistry, setBranchRegistry, tenantRegistry } from "./tenantRegistry";
import { useAuthStore } from "@/features/auth/store/authStore";
import { authApi, type SwitchableTenant } from "@/features/auth/api/authApi";
import type { TenantEntity } from "@/types/domain";

/** "semua" in the URL means the consolidated, cross-branch view. */
export const ALL_BRANCHES = "semua";

/** A tenant the switcher offers, with what the registry knows about it. */
export interface TenantChoice extends SwitchableTenant {
  jenis?: TenantEntity["jenis"];
  jenisUsaha?: TenantEntity["jenisUsaha"];
}

/**
 * Active tenant and branch.
 *
 * The branch is held in the URL, so a pasted link opens the same records for a
 * colleague — the property that decides whether "look at this surat jalan" is a
 * useful message or a confusing one.
 *
 * The tenant is NOT taken from the URL. It is the session's: a signed claim the
 * server reads on every request, and the only thing row-level security obeys.
 * The URL carries it so a link names its tenant, but a link naming another one
 * is surfaced as `linkTenant` for the user to switch into or dismiss — adopting
 * it silently would draw one company's name over another company's data, since
 * every request would still be answered for the session tenant.
 */
export function useScope() {
  const [params, setParams] = useSearchParams();
  const queryClient = useQueryClient();
  const user = useAuthStore((s) => s.user);

  // --- tenant -------------------------------------------------------------
  const sessionTenantId = useAuthStore((s) => s.tenant?.id ?? "");
  const switchSession = useAuthStore((s) => s.switchTenant);

  // The session tenant's ancestors and subtree, as GET /tenants returns them.
  const allTenants = tenantRegistry();
  const tenants = useMemo(() => allTenants.filter((t) => t.aktif), [allTenants]);

  const actingTenantId = sessionTenantId;
  const actingTenant = tenants.find((t) => t.id === actingTenantId) ?? null;

  const visibleTenantIds = useMemo(
    () => (actingTenantId ? subtreeOf(tenants, actingTenantId) : []),
    [tenants, actingTenantId],
  );

  // What the switcher offers comes from the server's own answer to "where may
  // I act", not from the registry: reads travel down the tree, so from inside a
  // subsidiary GET /tenants cannot show a sibling the user may still switch to,
  // and a tenant visible from above is not necessarily one the user may act as.
  const switchable = useQuery({
    queryKey: ["auth", "switchable-tenants", sessionTenantId],
    queryFn: () => authApi.listSwitchableTenants(),
    enabled: Boolean(sessionTenantId),
    staleTime: 5 * 60_000,
  });
  const tenantChoices = useMemo<TenantChoice[]>(
    () =>
      (switchable.data ?? []).map((choice) => {
        const known = tenants.find((t) => t.id === choice.id);
        return { ...choice, jenis: known?.jenis, jenisUsaha: known?.jenisUsaha };
      }),
    [switchable.data, tenants],
  );

  // A link naming a tenant other than the session's. Matched on id or code,
  // because hand-typed links carry the code.
  const rawTenant = params.get("tenant");
  const linkNamesOtherTenant =
    rawTenant !== null &&
    actingTenantId !== "" &&
    rawTenant !== actingTenantId &&
    rawTenant !== actingTenant?.kode;
  const linkTenant = linkNamesOtherTenant
    ? (tenantChoices.find((t) => t.id === rawTenant || t.code === rawTenant) ?? null)
    : null;

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
   * Move the session to another tenant.
   *
   * Asks the server first and changes nothing locally until it agrees: the
   * acting tenant is a signed claim, so the switch is a token exchange, and a
   * refused one (no access, ended session) throws with the scope untouched.
   *
   * Branch is deliberately reset rather than carried over: branch ids belong to
   * a tenant, so keeping one across a switch would either resolve to nothing or,
   * worse, to a different tenant's branch that happened to share an id. The new
   * tenant's own default is the only sensible landing place.
   */
  const setTenant = useCallback(
    async (nextTenantId: string) => {
      if (nextTenantId === actingTenantId) return;
      await switchSession(nextTenantId);

      // The previous tenant's branches are meaningless now; the layout's
      // branch query refetches after the cache clear below, and the fallback
      // lands on the new tenant's default branch once it arrives.
      setBranchRegistry([]);

      // Same ordering rule as setBranch: the cache clear triggers an immediate
      // refetch and those queries read the scope synchronously, so the scope
      // has to be right before the cache is emptied. Branch grants are the new
      // session's, read from the store the switch just wrote.
      setActiveScope({
        actingTenantId: nextTenantId,
        visibleTenantIds: subtreeOf(tenants, nextTenantId),
        branchId: null,
        allowedBranchIds: useAuthStore.getState().user?.branchIds ?? [],
      });

      const params = new URLSearchParams(window.location.search);
      params.set("tenant", nextTenantId);
      params.delete("cabang");
      setParams(params, { replace: false });
      queryClient.clear();
    },
    [actingTenantId, switchSession, setParams, queryClient, tenants],
  );

  /** Stay in the session tenant and drop the other tenant a link named. */
  const dismissLinkTenant = useCallback(() => {
    const params = new URLSearchParams(window.location.search);
    params.set("tenant", actingTenantId);
    params.delete("cabang");
    setParams(params, { replace: true });
  }, [actingTenantId, setParams]);

  // Keep the URL explicit, so a link always carries its full scope. The
  // branch is written only once branches have loaded: before that the
  // fallback is "consolidated", and pinning it would stop the default branch
  // from ever being chosen.
  const branchesLoaded = allBranches.length > 0;
  useEffect(() => {
    // A link naming another tenant is left alone until the user decides.
    if (linkNamesOtherTenant) return;
    if (raw && rawTenant) return;
    if (!actingTenantId) return;
    const params = new URLSearchParams(window.location.search);
    params.set("tenant", actingTenantId);
    if (raw || branchesLoaded) params.set("cabang", branchId ?? ALL_BRANCHES);
    setParams(params, { replace: true });
  }, [linkNamesOtherTenant, raw, rawTenant, actingTenantId, branchId, branchesLoaded, setParams]);

  return {
    /** The tenant writes land in: the session's. */
    tenant: actingTenant,
    /** Every tenant the session may switch into, the current one included. */
    tenants: tenantChoices,
    /** The acting tenant and its descendants — what reads may see. */
    visibleTenantIds,
    canSwitchTenant: tenantChoices.length > 1,
    setTenant,
    /**
     * Set when the URL names a tenant other than the session's: the switchable
     * tenant it names, or null with `linkNamesOtherTenant` true when the user
     * may not act there.
     */
    linkTenant,
    linkNamesOtherTenant,
    dismissLinkTenant,

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
