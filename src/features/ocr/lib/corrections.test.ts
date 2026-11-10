import { describe, expect, it } from "vitest";
import { correctionsOf } from "./corrections";

const read = { merchantName: "PERTAMINA", txnDate: "2026-11-08", totalAmount: 150000, referenceNo: undefined };
const unchanged = { merchantName: "PERTAMINA", txnDate: "2026-11-08", totalAmount: 150000, referenceNo: "" };

describe("correctionsOf", () => {
  it("sends nothing when the reviewer accepted the reading", () => {
    expect(correctionsOf(read, unchanged)).toBeUndefined();
  });

  it("sends only the values the reviewer changed", () => {
    expect(correctionsOf(read, { ...unchanged, totalAmount: 155000, merchantName: " PERTAMINA " }))
      .toEqual({ totalAmount: 155000 });
  });

  it("sends what was typed where the engine read nothing", () => {
    const empty = { merchantName: undefined, txnDate: undefined, totalAmount: undefined, referenceNo: undefined };
    expect(correctionsOf(empty, { merchantName: "Toko ATK", txnDate: "2026-11-01", totalAmount: 42000, referenceNo: "REF-1" }))
      .toEqual({ merchantName: "Toko ATK", txnDate: "2026-11-01", totalAmount: 42000, referenceNo: "REF-1" });
  });

  // Clearing a field is not a correction: null means "not read", and the
  // server keeps the engine's value rather than storing an empty one.
  it("does not turn a cleared field into a correction", () => {
    expect(correctionsOf(read, { ...unchanged, merchantName: "", totalAmount: 0 })).toBeUndefined();
  });
});
