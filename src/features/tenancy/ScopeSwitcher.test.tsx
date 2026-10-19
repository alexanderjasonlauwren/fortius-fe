// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { PERMISSIONS } from "@/features/rbac/permissions";

/**
 * The regression this file exists for: GET /tenants returns a driver's own
 * tenant AND its ancestors, for breadcrumb context -- so a seeded driver
 * account genuinely sees more than one row there, and `canSwitchTenant`
 * (tenants.length > 1) reads true for them exactly as it would for an
 * ops_manager. Confirmed live against the running backend: the seeded driver
 * account's GET /tenants returns both `pt-salatiga` (their own) and
 * `bimbo-holdings` (its parent group). Nothing on the backend stops a driver
 * from *reading* that list; ScopeSwitcher is what has to stop them being
 * offered it as something to switch to.
 */
const state = vi.hoisted(() => ({ permissions: [] as string[] }));
vi.mock("@/features/auth/store/authStore", () => ({
  useAuthStore: (selector: (s: { user: { permissions: string[] } }) => unknown) =>
    selector({ user: { permissions: state.permissions } }),
}));

const scope = vi.hoisted(() => ({
  branches: [
    { id: "b1", kode: "SLT", nama: "Depot Salatiga", kota: "Salatiga", aktif: true, utama: true, tenantId: "t1" },
  ],
  branch: { id: "b1", kode: "SLT", nama: "Depot Salatiga", kota: "Salatiga" },
  branchId: "b1",
  isConsolidated: false,
  canSeeAll: false,
  setBranch: vi.fn(),
  tenant: { id: "t1", kode: "pt-salatiga", nama: "PT Bimbo Salatiga", level: 1, jenis: "operasional" as const, jenisUsaha: "lpg_distribution" },
  // Two switchable tenants: its own and the group it sits under.
  tenants: [
    { id: "t1", code: "pt-salatiga", name: "PT Bimbo Salatiga", level: 1, viaMembership: true, jenis: "operasional" as const, jenisUsaha: "lpg_distribution" },
    { id: "t0", code: "bimbo-holdings", name: "Bimbo Holdings", level: 0, viaMembership: false, jenis: "grup" as const, jenisUsaha: "" },
  ],
  canSwitchTenant: true,
  setTenant: vi.fn(),
}));
vi.mock("./useScope", () => ({ useScope: () => scope }));
// Switching goes through the shared mutation hook; its toast and cache
// plumbing are not what this file tests.
vi.mock("@/hooks/useDeskMutation", () => ({
  useDeskMutation: () => ({ mutate: vi.fn(), isPending: false, variables: undefined }),
}));

import { ScopeSwitcher } from "./ScopeSwitcher";

afterEach(cleanup);
beforeEach(() => {
  state.permissions = [];
});

describe("the scope switcher for a driver-console account", () => {
  it("never renders an interactive control, even though more than one tenant is visible", () => {
    state.permissions = [
      PERMISSIONS.DELIVERIES_VIEW,
      PERMISSIONS.DELIVERIES_EXECUTE,
      PERMISSIONS.EXPENSES_VIEW,
      PERMISSIONS.SETTINGS_VIEW,
    ];

    render(<ScopeSwitcher />);

    expect(screen.queryByRole("button")).toBeNull();
    // The parent group must not even be named where a click could reach it.
    expect(screen.queryByText("Bimbo Holdings")).toBeNull();
    expect(screen.queryByText("Semua cabang")).toBeNull();
  });

  it("states the branch without offering a choice", () => {
    state.permissions = [PERMISSIONS.DELIVERIES_EXECUTE];
    render(<ScopeSwitcher />);
    expect(screen.getByText("Depot Salatiga")).toBeTruthy();
  });
});

describe("the scope switcher for a full-console account", () => {
  it("still offers the tenant switcher when more than one tenant is visible", () => {
    state.permissions = [PERMISSIONS.DISTRIBUTION_VIEW, PERMISSIONS.DELIVERIES_EXECUTE];
    render(<ScopeSwitcher />);
    expect(screen.getByRole("button")).toBeTruthy();
  });
});
