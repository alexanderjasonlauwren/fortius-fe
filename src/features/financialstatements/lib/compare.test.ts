import { describe, expect, it } from "vitest";
import type { Statement } from "../api/contract";
import { mergeOwnCompare, parseCompare, shiftBSAsOf, shiftPLWindow } from "./compare";

function stmt(lines: { code: string; amount: number }[]): Statement {
  return {
    layout: { code: "laba_rugi", name: "Laporan Laba Rugi" },
    period: {},
    company: { legalName: "PT Contoh" },
    lines: lines.map((l) => ({
      code: l.code, label: l.code, kind: "accounts", parentCode: null,
      level: 0, isBold: false, noteNumber: null, amount: l.amount, ratio: null, accounts: [],
    })),
    balanced: true,
    warnings: [],
  };
}

describe("parseCompare", () => {
  it("parses external:<id>", () => {
    expect(parseCompare("external:abc-123")).toEqual({ kind: "external", externalId: "abc-123" });
  });
  it("parses prior_period and prior_year", () => {
    expect(parseCompare("prior_period")).toEqual({ kind: "prior_period" });
    expect(parseCompare("prior_year")).toEqual({ kind: "prior_year" });
  });
  it("returns undefined for empty", () => {
    expect(parseCompare(undefined)).toBeUndefined();
    expect(parseCompare("")).toBeUndefined();
  });
  it("rejects anything else", () => {
    expect(() => parseCompare("nonsense")).toThrow();
  });
});

describe("shiftPLWindow", () => {
  it("prior_period is the immediately preceding window of the same length", () => {
    // 2025 is 365 days; 2024 is a leap year (366), so a 365-day window
    // ending 2024-12-31 cannot start 2024-01-01 -- that would be 366 days.
    // It starts one day later.
    expect(shiftPLWindow("2025-01-01", "2025-12-31", "prior_period")).toEqual(["2024-01-02", "2024-12-31"]);
    // March is 31 days, February (2025, non-leap) is 28 -- the preceding
    // window of the SAME length (31 days) ending 2025-02-28 therefore
    // spills back into January, it is not simply "the month before".
    expect(shiftPLWindow("2025-03-01", "2025-03-31", "prior_period")).toEqual(["2025-01-29", "2025-02-28"]);
  });
  it("prior_year is the same dates one calendar year earlier", () => {
    expect(shiftPLWindow("2025-03-01", "2025-03-31", "prior_year")).toEqual(["2024-03-01", "2024-03-31"]);
  });
});

describe("shiftBSAsOf", () => {
  it("prior_period is the end of the preceding calendar month", () => {
    expect(shiftBSAsOf("2025-12-31", "prior_period")).toBe("2025-11-30");
    expect(shiftBSAsOf("2025-03-15", "prior_period")).toBe("2025-02-28");
  });
  it("prior_year is the same date one calendar year earlier", () => {
    expect(shiftBSAsOf("2025-12-31", "prior_year")).toBe("2024-12-31");
  });
});

describe("mergeOwnCompare", () => {
  it("sets compareAmount/variance only on matching codes, and never produces extras", () => {
    const current = stmt([{ code: "laba_bersih", amount: 100 }, { code: "ebitda", amount: 80 }]);
    const prior = stmt([{ code: "laba_bersih", amount: 60 }]);
    const merged = mergeOwnCompare(current, prior, "prior_period", "2024-01-01 - 2024-12-31", "pl:x");

    const laba = merged.lines.find((l) => l.code === "laba_bersih");
    expect(laba?.compareAmount).toBe(60);
    expect(laba?.variance).toBe(40);

    const ebitda = merged.lines.find((l) => l.code === "ebitda");
    expect(ebitda?.compareAmount).toBeUndefined();

    expect(merged.compare).toEqual({ kind: "prior_period", label: "2024-01-01 - 2024-12-31" });
    expect(merged.extraCompareLines).toBeUndefined();
  });
});
