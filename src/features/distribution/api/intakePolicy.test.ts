import { beforeEach, describe, expect, it, vi } from "vitest";
import { NAV_GROUPS, isAvailableForIntake, navGroupsFor } from "@/layouts/nav";
import { PERMISSIONS } from "@/features/rbac/permissions";
import { allowsManualIntake } from "./intakePolicy.contract";

const state = vi.hoisted(() => ({ getOne: vi.fn(), actingTenantId: "child", db: { settingsByTenant: [] as { tenantId: string; values: { orderIntakeMode?: "manual" | "external_schedule" } }[], tenants: [{ id: "root", indukId: null }, { id: "child", indukId: "root" }, { id: "sibling", indukId: "root" }] } }));
vi.mock("@/lib/api", () => ({ getOne: state.getOne }));
vi.mock("@/mocks/db", () => ({ getDb: () => state.db }));
vi.mock("@/mocks/scope", () => ({ getActiveScope: () => ({ actingTenantId: state.actingTenantId }) }));
import { intakePolicyHttp } from "./intakePolicy.http";
import { intakePolicyMock } from "./intakePolicy.mock";

beforeEach(() => { state.getOne.mockReset(); state.actingTenantId = "child"; state.db.settingsByTenant = []; });
describe("manual intake availability", () => {
  it.each(["manual", "external_schedule"] as const)("reads the signed-session policy %s without a tenant override", async (mode) => {
    state.getOne.mockResolvedValue({ order_intake_mode: mode });
    expect(await intakePolicyHttp.getIntakePolicy()).toBe(mode);
    expect(state.getOne).toHaveBeenCalledWith("/distribution/intake-policy");
  });
  it("fails closed on unknown, failed, and invalid policy", async () => {
    expect(allowsManualIntake(undefined)).toBe(false);
    state.getOne.mockResolvedValue({ order_intake_mode: "unexpected" });
    await expect(intakePolicyHttp.getIntakePolicy()).rejects.toThrow("tidak valid");
    state.getOne.mockRejectedValue(new Error("network"));
    await expect(intakePolicyHttp.getIntakePolicy()).rejects.toThrow("network");
  });
  it("hides sidebar and palette order entries unless manual policy is known", () => {
    const order = NAV_GROUPS.flatMap((group) => group.items).find((item) => item.href === "/orders")!;
    for (const mode of [undefined, "external_schedule"] as const) {
      expect(isAvailableForIntake(order, mode)).toBe(false);
      expect(navGroupsFor([PERMISSIONS.ORDERS_VIEW], mode).flatMap((group) => group.items).some((item) => item.href === "/orders")).toBe(false);
    }
    expect(isAvailableForIntake(order, "manual")).toBe(true);
    expect(navGroupsFor([PERMISSIONS.ORDERS_VIEW], "manual").flatMap((group) => group.items).some((item) => item.href === "/orders")).toBe(true);
    expect(navGroupsFor([], "manual").flatMap((group) => group.items).some((item) => item.href === "/orders")).toBe(false);
  });
  it("mock policy inherits only the acting tenant ancestors and permits explicit override", async () => {
    state.db.settingsByTenant = [{ tenantId: "root", values: { orderIntakeMode: "external_schedule" } }, { tenantId: "sibling", values: { orderIntakeMode: "manual" } }];
    expect(await intakePolicyMock.getIntakePolicy()).toBe("external_schedule");
    state.db.settingsByTenant.push({ tenantId: "child", values: { orderIntakeMode: "manual" } });
    expect(await intakePolicyMock.getIntakePolicy()).toBe("manual");
    state.db.settingsByTenant = [];
    expect(await intakePolicyMock.getIntakePolicy()).toBe("manual");
  });
});
