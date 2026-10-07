/**
 * Tenant and branch scoping.
 *
 * The backend enforces tenancy in the database — row-level security on 59
 * tables, with composite foreign keys making cross-tenant rows structurally
 * impossible. This is the frontend's equivalent: one place that narrows the
 * store, so no feature API has to remember to filter.
 *
 * # Reads travel down the tree; writes do not
 *
 * That asymmetry is the whole design and it is why there are two tenant fields
 * rather than one. A group can SEE its subsidiaries' rows — `visibleTenantIds`
 * — but everything it writes lands in the tenant it is ACTING as. To write
 * inside a subsidiary you switch into it, which is what makes that subsidiary's
 * invoice carry its own number series and its own tax identity.
 *
 * Mirrored from the backend exactly: `USING (tenant_id = ANY
 * (visible_tenant_ids()))` against `WITH CHECK (tenant_id =
 * current_tenant_id())`. If these two ever disagree, this file is the one that
 * is wrong.
 *
 * Branch may be null — "all branches I can see" — which is how a head office
 * gets consolidated figures.
 */

import { assertMockAllowed } from "@/lib/dataSource";
import { setActingTenant } from "./actingTenant";
import { getDb } from "./db";
import type { Database, ID, Scoped, TenantEntity } from "./types";

export interface ActiveScope {
  /** What writes are stamped with. Exactly one tenant, always. */
  actingTenantId: ID;
  /**
   * What reads may see: the acting tenant and its descendants.
   *
   * Always contains `actingTenantId`. A leaf tenant's array is one long, and
   * that is not a special case — it is the same rule with nothing beneath it.
   */
  visibleTenantIds: ID[];
  /** null = consolidated across every branch the user may see. */
  branchId: ID | null;
  /** Branches this user is allowed to read. Empty = all of them. */
  allowedBranchIds: ID[];
}

let active: ActiveScope | null = null;

/**
 * Sets the active scope — except a regression to no acting tenant once a
 * real one has already been set.
 *
 * `useScope` calls this unconditionally on every render, computed from
 * `tenantRegistry()` (see its own header: filled asynchronously by the
 * layout's tenant-list query). `tenantRegistry()` can read empty for an
 * instant it never should have — an HMR module reset during development
 * is one way, but the guard is not specific to that cause; any transient
 * emptiness between two renders has the same effect. A query that reads
 * `getActingTenant()` synchronously during that instant (any `*Api.http.ts`
 * building a request path from it) fails with "Tidak ada tenant aktif" —
 * and with this app's `retry: 0` default, that failure is permanent, not
 * transient, because nothing re-runs the query once the scope recovers a
 * render later.
 *
 * Found live: `SettingsPage` hung on its own loading skeleton forever
 * against the API build, `settings.status` had actually moved to `"error"`
 * with exactly this message, and the page's `if (!form)` guard could not
 * tell that apart from still loading. This is the root-cause fix; see
 * SettingsPage.tsx for the belt-and-braces fix on the consumer side.
 *
 * Never legitimate to defend against: an intentional "no tenant" scope is
 * not a state this application has — every real switch names a tenant
 * explicitly (`useScope`'s `setTenant`), so a blank incoming value here is
 * always the transient case, never a deliberate one.
 */
export function setActiveScope(scope: ActiveScope) {
  if (!scope.actingTenantId && active?.actingTenantId) return;
  active = scope;
  // Mirrored so getDb() can resolve settings without importing this module —
  // see mocks/actingTenant.ts for why that would recurse.
  setActingTenant(scope.actingTenantId);
  // Scope bugs look exactly like stale data, so make the active scope
  // inspectable from the console while developing. Guarded on `window`
  // existing, not just DEV -- the unit test suite runs this same function
  // under Node, deliberately with no DOM (see vite.config.ts's own note).
  if (import.meta.env.DEV && typeof window !== "undefined") {
    (window as unknown as Record<string, unknown>).__scope = scope;
  }
}

export function getActiveScope(): ActiveScope {
  if (active) return active;
  const db = getDb();
  // The root tenant, as the fallback before useScope has run. Not simply
  // `tenants[0]`: seed order is not a guarantee, and landing on a subsidiary
  // by accident would hide the rest of the tree.
  const root = db.tenants.find((t) => t.indukId === null) ?? db.tenants[0];
  const utama = db.branches.find((b) => b.utama) ?? db.branches[0];
  return {
    actingTenantId: root?.id ?? "",
    visibleTenantIds: root ? subtreeOf(db.tenants, root.id) : [],
    branchId: utama?.id ?? null,
    allowedBranchIds: [],
  };
}

/**
 * A tenant and every tenant beneath it.
 *
 * The mock's equivalent of `public.visible_tenant_ids()`, which the backend
 * answers from a closure table. Walked here instead: a demo tree is a handful
 * of rows, and a closure table in the browser would be machinery with nothing
 * to buy.
 */
export function subtreeOf(tenants: TenantEntity[], rootId: ID): ID[] {
  const ids = [rootId];
  // Breadth-first, and index-based on purpose: pushing while iterating is what
  // makes one pass reach every level.
  for (let i = 0; i < ids.length; i++) {
    for (const t of tenants) {
      if (t.indukId === ids[i] && !ids.includes(t.id)) ids.push(t.id);
    }
  }
  return ids;
}

function visible(scope: ActiveScope): (row: Scoped) => boolean {
  return (row) => {
    // Down the tree, not one tenant. This is the read half of the asymmetry.
    if (!scope.visibleTenantIds.includes(row.tenantId)) return false;
    if (scope.branchId) return row.branchId === scope.branchId;
    if (scope.allowedBranchIds.length > 0) {
      return scope.allowedBranchIds.includes(row.branchId);
    }
    return true;
  };
}

/**
 * The store, narrowed to the active scope.
 *
 * Returns the same shape as `getDb()` so feature APIs only swap the accessor.
 * Tenant-level tables — chart of accounts, products, users, settings — are not
 * branch-scoped and pass through untouched.
 */
export function scopedDb(override?: Partial<ActiveScope>): Database {
  // The one accessor every mock-only feature API goes through, which makes it
  // the place to refuse. getDb() deliberately does NOT check: the scope
  // switcher and the lexicon read the raw store to bootstrap, and they run in
  // both builds. See assertMockAllowed for what this is defending against.
  assertMockAllowed("scopedDb");

  const scope = { ...getActiveScope(), ...override };
  const db = getDb();
  const keep = visible(scope);

  return {
    ...db,
    outlets: db.outlets.filter(keep),
    drivers: db.drivers.filter(keep),
    scheduleAgreements: db.scheduleAgreements.filter(keep),
    plans: db.plans.filter(keep),
    deliveries: db.deliveries.filter(keep),
    invoices: db.invoices.filter(keep),
    payments: db.payments.filter(keep),
    creditNotes: db.creditNotes.filter(keep),
    receipts: db.receipts.filter(keep),
    orders: db.orders.filter(keep),
    journals: db.journals.filter(keep),
    cashVouchers: db.cashVouchers.filter(keep),
    bankStatementImports: db.bankStatementImports.filter(keep),
    bankStatementRules: db.bankStatementRules.filter(keep),
    transportationClaims: db.transportationClaims.filter(keep),
    // Daily targets and import batches have no scope of their own; they follow
    // their agreement, the same way plan rows follow their plan.
    saDailyTargets: db.saDailyTargets.filter((t) =>
      db.scheduleAgreements.filter(keep).some((s) => s.id === t.saId),
    ),
    saImportBatches: db.saImportBatches.filter((b) =>
      db.scheduleAgreements.filter(keep).some((s) => s.id === b.saId),
    ),
    sim3lonSourceSnapshots: db.sim3lonSourceSnapshots.filter(keep),
    sim3lonPlanSources: db.sim3lonPlanSources.filter(keep),
    // planRows have no scope of their own; they follow their plan.
    planRows: db.planRows.filter((r) =>
      db.plans.filter(keep).some((p) => p.id === r.planId),
    ),
  };
}

/**
 * Stamps a new row with the tenant and branch it is being created in.
 *
 * `actingTenantId`, never `visibleTenantIds` — this is the write half, and it
 * is the line that must not drift. A row stamped with anything a group can
 * merely see would be a cross-tenant write, which the backend's WITH CHECK
 * refuses outright.
 */
export function stampScope<T>(row: T, override?: Partial<ActiveScope>): T & Scoped {
  const scope = { ...getActiveScope(), ...override };
  const db = getDb();
  const branchId =
    scope.branchId ?? db.branches.find((b) => b.utama)?.id ?? db.branches[0]?.id ?? "";
  return { ...row, tenantId: scope.actingTenantId, branchId };
}

/**
 * Query-key prefix for the active scope.
 *
 * A plain function rather than a hook so every call site can use it without
 * plumbing: `useScope()` runs in the layout and sets the active scope before
 * any child renders, and switching branch clears the cache outright.
 */
export function scopeKey(): readonly [string, string] {
  const scope = getActiveScope();
  return [scope.actingTenantId, scope.branchId ?? "semua"] as const;
}

/** Branches the current user may read, for the switcher. */
export function visibleBranches() {
  const scope = getActiveScope();
  const db = getDb();
  return db.branches.filter(
    (b) =>
      scope.visibleTenantIds.includes(b.tenantId) &&
      b.aktif &&
      (scope.allowedBranchIds.length === 0 || scope.allowedBranchIds.includes(b.id)),
  );
}
