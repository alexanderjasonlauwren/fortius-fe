/**
 * The tenant and branch lists, readable synchronously.
 *
 * `useScope` must produce a scope DURING render — `setActiveScope` runs before
 * any child renders, because request paths and query keys read it
 * synchronously. The lists come from async queries, so the layout fetches them
 * and pushes them in here, and useScope reads whatever is present. Before the
 * first response both are empty, which renders an empty switcher for an instant
 * rather than a wrong one.
 */
import type { BranchEntity, TenantEntity } from "@/types/domain";

let tenants: TenantEntity[] = [];
let branches: BranchEntity[] = [];

export function setTenantRegistry(next: TenantEntity[]): void {
  tenants = next;
}

/** Every tenant this session may see. */
export function tenantRegistry(): TenantEntity[] {
  return tenants;
}

export function setBranchRegistry(next: BranchEntity[]): void {
  branches = next;
}

/** The session tenant's branches, as row-level security scopes them. */
export function branchRegistry(): BranchEntity[] {
  return branches;
}
