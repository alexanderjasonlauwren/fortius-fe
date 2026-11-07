import { ApiError } from "@/lib/api";

/** The outlet a CREDIT_LIMIT_BREACHED refusal names. */
export interface CreditBreach {
  outletId: string;
  outletName: string;
  reason: string;
}

/**
 * The breach a dispatch refusal carries, or undefined for any other refusal
 * ("the run has already left", "no stops", a suspended outlet), which has no
 * override path. Read from the code and its details, never the message.
 */
export function creditBreachOf(error: unknown): CreditBreach | undefined {
  if (!(error instanceof ApiError) || error.code !== "CREDIT_LIMIT_BREACHED") return undefined;
  const details = (error.details ?? {}) as { outlet_id?: unknown; outlet_name?: unknown; reason?: unknown };
  if (typeof details.outlet_id !== "string" || details.outlet_id === "") return undefined;
  return {
    outletId: details.outlet_id,
    outletName: typeof details.outlet_name === "string" ? details.outlet_name : "",
    reason: typeof details.reason === "string" ? details.reason : error.message,
  };
}
