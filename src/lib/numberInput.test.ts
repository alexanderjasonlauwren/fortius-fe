import { describe, expect, it } from "vitest";
import { draftOf, parseNumberDraft, sanitizeNumberDraft } from "./numberInput";
import { formatNumber } from "./format";

describe("number field drafts", () => {
  it("drops the leading zeros the client saw (0560, 011584)", () => {
    expect(sanitizeNumberDraft("0560", 2)).toBe("560");
    expect(sanitizeNumberDraft("011584", 2)).toBe("11584");
    expect(sanitizeNumberDraft("0", 2)).toBe("0");
  });

  it("keeps digits and one dot, nothing else", () => {
    expect(sanitizeNumberDraft("11.584.46", 2)).toBe("11.58");
    expect(sanitizeNumberDraft("Rp 6,487,297", 2)).toBe("6487297");
    expect(sanitizeNumberDraft(".5", 2)).toBe("0.5");
    expect(sanitizeNumberDraft("12.", 2)).toBe("12.");
  });

  it("caps decimals, and an integer field takes none", () => {
    expect(sanitizeNumberDraft("11584.459375", 4)).toBe("11584.4593");
    expect(sanitizeNumberDraft("560.5", 0)).toBe("5605");
  });

  it("reads a draft as a number, empty as zero", () => {
    expect(parseNumberDraft("11584.46")).toBe(11584.46);
    expect(parseNumberDraft("")).toBe(0);
    expect(parseNumberDraft("12.")).toBe(12);
    expect(draftOf(0)).toBe("");
    expect(draftOf(560)).toBe("560");
  });

  it("shows comma thousands and a dot for decimals on blur", () => {
    expect(formatNumber(560)).toBe("560");
    expect(formatNumber(11584)).toBe("11,584");
    expect(formatNumber(6487297)).toBe("6,487,297");
    expect(formatNumber(11584.46)).toBe("11,584.46");
    expect(formatNumber(11584.4594, { maximumFractionDigits: 4 })).toBe("11,584.4594");
  });
});
