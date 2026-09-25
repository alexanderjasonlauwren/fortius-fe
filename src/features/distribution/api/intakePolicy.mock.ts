import { getDb } from "@/mocks/db";
import { getActiveScope } from "@/mocks/scope";
import type { IntakePolicyApi } from "./intakePolicy.contract";

export const intakePolicyMock: IntakePolicyApi = {
  async getIntakePolicy() {
    const db = getDb();
    let tenantId: string | null = getActiveScope().actingTenantId;
    const visited = new Set<string>();
    while (tenantId && !visited.has(tenantId)) {
      visited.add(tenantId);
      const mode = db.settingsByTenant.find((row) => row.tenantId === tenantId)?.values.orderIntakeMode;
      if (mode) return mode;
      tenantId = db.tenants.find((row) => row.id === tenantId)?.indukId ?? null;
    }
    return "manual";
  },
};
