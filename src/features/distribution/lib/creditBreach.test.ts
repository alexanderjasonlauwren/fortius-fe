import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { creditBreachOf } from "./creditBreach";

describe("creditBreachOf", () => {
  it("reads the outlet from the refusal's details, not its message", () => {
    const error = new ApiError({
      message: "Pangkalan X is over its credit limit -- dispatch refused",
      code: "CREDIT_LIMIT_BREACHED",
      status: 409,
      details: { outlet_id: "o-1", outlet_name: "Pangkalan Y", reason: "over limit" },
    });
    expect(creditBreachOf(error)).toEqual({ outletId: "o-1", outletName: "Pangkalan Y", reason: "over limit" });
  });

  it("ignores any other refusal, even one whose message mentions credit", () => {
    expect(creditBreachOf(new ApiError({ message: "credit limit", code: "CONFLICT", status: 409 }))).toBeUndefined();
    expect(creditBreachOf(new ApiError({ message: "suspended", code: "OUTLET_SUSPENDED", status: 409 }))).toBeUndefined();
    expect(creditBreachOf(new Error("credit limit overdue"))).toBeUndefined();
  });

  it("ignores a breach code with no outlet to override", () => {
    expect(creditBreachOf(new ApiError({ message: "x", code: "CREDIT_LIMIT_BREACHED", details: [] }))).toBeUndefined();
  });

  it("keeps a validation failure's details as its violations", () => {
    const error = new ApiError({ message: "bad", code: "VALIDATION_FAILED", details: [{ field: "code", rule: "required", message: "m" }] });
    expect(error.violations).toHaveLength(1);
    expect(new ApiError({ message: "x", code: "CREDIT_LIMIT_BREACHED", details: { outlet_id: "o" } }).violations).toEqual([]);
  });
});
