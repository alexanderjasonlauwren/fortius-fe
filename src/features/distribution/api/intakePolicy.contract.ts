export type OrderIntakeMode = "manual" | "external_schedule";

export interface IntakePolicyApi {
  getIntakePolicy(): Promise<OrderIntakeMode>;
}

/** Missing, loading, failed, and invalid policies never authorize manual intake. */
export function allowsManualIntake(mode: OrderIntakeMode | undefined): boolean {
  return mode === "manual";
}
