import { describe, expect, it } from "vitest";
import { journalSourceHref } from "./journalSource";

describe("journal source links", () => {
  it("opens the document's own page when it has one", () => {
    expect(journalSourceHref("invoice", "inv-1")).toBe("/receivables/inv-1");
    expect(journalSourceHref("purchase", "p-1")).toBe("/purchases/p-1");
    // A bill payment's source id is its bill -- the page the payment is on.
    expect(journalSourceHref("purchasePayment", "p-1")).toBe("/purchases/p-1");
    expect(journalSourceHref("transportationClaim", "c-1")).toBe("/transportation-claims/c-1");
  });

  it("falls back to the module, and to nothing for a journal that is its own document", () => {
    expect(journalSourceHref("payment", "x")).toBe("/payments");
    expect(journalSourceHref("manual")).toBeUndefined();
  });
});
