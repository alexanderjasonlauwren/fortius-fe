import { describe, expect, it } from "vitest";
import { splitByQuantity } from "./split";

describe("splitByQuantity", () => {
  it("splits SA 3107050 to the rupiah and adds back to the total debit", () => {
    const shares = splitByQuantity(29_656_216, [560, 360, 360, 360, 560, 360]);
    expect(shares.reduce((s, x) => s + x, 0)).toBe(29_656_216);
    expect(shares[0]).toBe(6_487_297);
    expect(shares[4]).toBe(6_487_297);
    for (const i of [1, 2, 3, 5]) expect([4_170_405, 4_170_406]).toContain(shares[i]);
  });

  it("matches the backend: the two largest fractions take the leftover rupiah, earlier lines first", () => {
    // The API answered 4,170,406 on lines 2 and 3 for this PDF.
    expect(splitByQuantity(29_656_216, [560, 360, 360, 360, 560, 360])).toEqual([
      6_487_297, 4_170_406, 4_170_406, 4_170_405, 6_487_297, 4_170_405,
    ]);
  });

  it("keeps cents and returns zeros with nothing to split", () => {
    const odd = splitByQuantity(100.5, [1, 2]);
    expect(odd[0] + odd[1]).toBeCloseTo(100.5, 2);
    expect(splitByQuantity(0, [1, 2])).toEqual([0, 0]);
  });
});
