import { describe, expect, it } from "vitest";
import { chargeFor, monthlyAmount, periodIndex } from "./depreciation";

describe("monthlyAmount", () => {
  it("divides (cost-residual) by useful life, rounded", () => {
    expect(monthlyAmount(10, 0, 3)).toBe(3); // 3.33 -> 3
    expect(monthlyAmount(350_000_000, 50_000_000, 60)).toBe(5_000_000);
  });

  it("returns 0 for a non-positive useful life", () => {
    expect(monthlyAmount(100, 0, 0)).toBe(0);
  });
});

describe("periodIndex", () => {
  it("is 1 for the month depreciation starts, 2 for the next", () => {
    expect(periodIndex("2026-01-15", "2026-01")).toBe(1);
    expect(periodIndex("2026-01-15", "2026-02")).toBe(2);
  });

  it("counts across a year boundary", () => {
    expect(periodIndex("2024-06-01", "2026-09")).toBe(28);
  });
});

describe("chargeFor", () => {
  // Mirrors fortius-backend's own TestStraightLineLastMonthAbsorbsRounding:
  // 10 over 3 months is 3.33 rounded to 3/month, so month 3 must charge 4,
  // not 3, or the cumulative total would fall short of cost-residual.
  it("has the last period absorb the rounding so the total lands exactly on cost-residual", () => {
    const amounts = [1, 2, 3].map((index) => chargeFor(10, 0, 3, index));
    expect(amounts).toEqual([3, 3, 4]);
    expect(amounts.reduce((a, b) => a + b, 0)).toBe(10);
  });

  it("charges nothing outside [1, usefulLifeMonths]", () => {
    expect(chargeFor(10, 0, 3, 0)).toBe(0);
    expect(chargeFor(10, 0, 3, 4)).toBe(0);
  });
});
