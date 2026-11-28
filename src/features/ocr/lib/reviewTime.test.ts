import { describe, expect, it } from "vitest";
import { reviewSeconds } from "./reviewTime";

describe("reviewSeconds", () => {
  it("rounds to whole seconds", () => {
    expect(reviewSeconds(1_000, 43_400)).toBe(42);
  });
  it("is unknown without an opening time or with a clock that went back", () => {
    expect(reviewSeconds(undefined, 5_000)).toBeUndefined();
    expect(reviewSeconds(5_000, 1_000)).toBeUndefined();
  });
  it("caps a form left open for days at one day, which the server accepts", () => {
    expect(reviewSeconds(0, 3 * 86_400_000)).toBe(86_400);
  });
});
