import { describe, expect, it } from "vitest";
import { isInFlight, isPangkalanPayment, isReviewable } from "./status";

describe("receipt queue rules", () => {
  it("does not offer a decision while the engine is reading", () => {
    expect(isReviewable({ status: "pending", processStatus: "queued" })).toBe(false);
    expect(isReviewable({ status: "pending", processStatus: "processing" })).toBe(false);
  });

  // A failed reading is typed in by the reviewer, so it stays in the queue.
  it("keeps a failed reading reviewable", () => {
    expect(isReviewable({ status: "pending", processStatus: "failed" })).toBe(true);
  });

  it("closes a receipt once it is approved or rejected", () => {
    expect(isReviewable({ status: "approved", processStatus: "ready" })).toBe(false);
    expect(isReviewable({ status: "rejected", processStatus: "ready" })).toBe(false);
    expect(isReviewable({ status: "needs_review", processStatus: "ready" })).toBe(true);
  });

  it("polls only for what the engine still has", () => {
    expect(isInFlight({ processStatus: "queued" })).toBe(true);
    expect(isInFlight({ processStatus: "ready" })).toBe(false);
    expect(isInFlight({ processStatus: "failed" })).toBe(false);
  });

  it("recognises a pangkalan's LPG payment by the engine's category", () => {
    expect(isPangkalanPayment({ suggestedCategory: "penebusan_pangkalan" })).toBe(true);
    expect(isPangkalanPayment({ suggestedCategory: "bensin_bbm" })).toBe(false);
  });
});
