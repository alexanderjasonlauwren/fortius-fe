import { getOne } from "@/lib/api";
import type { IntakePolicyApi } from "./intakePolicy.contract";

export const intakePolicyHttp: IntakePolicyApi = {
  async getIntakePolicy() {
    const policy = await getOne<{ order_intake_mode: unknown }>("/distribution/intake-policy");
    if (policy.order_intake_mode !== "manual" && policy.order_intake_mode !== "external_schedule") {
      throw new Error("Pengaturan sumber pesanan tidak bisa dibaca. Muat ulang halaman.");
    }
    return policy.order_intake_mode;
  },
};
