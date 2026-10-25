import { describe, expect, it } from "vitest";
import { addDaysIso } from "./date";

describe("addDaysIso", () => {
  it("adds payment-term days across a month and a year end", () => {
    expect(addDaysIso("2026-10-25", 14)).toBe("2026-11-08");
    expect(addDaysIso("2026-12-25", 30)).toBe("2027-01-24");
    expect(addDaysIso("2026-10-14", 0)).toBe("2026-10-14");
  });
});
