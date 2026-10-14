import { describe, expect, it } from "vitest";
import { disposalPreview } from "./disposal";

describe("disposal preview", () => {
  it("is a gain when sold above book value", () => {
    expect(disposalPreview(120_000_000, 30_000_000, 100_000_000)).toEqual({ bookValue: 90_000_000, gain: 10_000_000, loss: 0 });
  });
  it("is a loss for the whole book value on a write-off", () => {
    expect(disposalPreview(120_000_000, 30_000_000, 0)).toEqual({ bookValue: 90_000_000, gain: 0, loss: 90_000_000 });
  });
  it("is neither when sold at book value", () => {
    expect(disposalPreview(10, 4, 6)).toEqual({ bookValue: 6, gain: 0, loss: 0 });
  });
});
