import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { describeFailure } from "./useDeskMutation";

describe("failure messages", () => {
  it("say a locked period in the desk's words, by code", () => {
    const closed = new ApiError({ message: "The period 2026-09 is closed; date the entry in an open month", code: "PERIOD_CLOSED", status: 409 });
    expect(describeFailure(closed)).toMatch(/sudah ditutup/);
    const review = new ApiError({ message: "x", code: "PERIOD_IN_REVIEW", status: 409 });
    expect(describeFailure(review)).toMatch(/sedang ditinjau/);
  });

  // A driver at a gate cannot act on "This drop is already partial and
  // cannot be filed against again"; they can act on "muat ulang rute Anda".
  it("tell a driver what to do when a drop was already filed elsewhere", () => {
    for (const [code, english] of [
      ["DROP_ALREADY_CLOSED", "This drop is already partial and cannot be filed against again"],
      ["DROP_ALREADY_DEPARTED", "This drop has already departed"],
      ["DROP_ALREADY_ARRIVED", "This drop is already marked as arrived"],
      ["DROP_OVER_LOAD", "This drop carried 30, and 31 delivered plus 0 refused is more than that"],
    ]) {
      const said = describeFailure(new ApiError({ message: english, code, status: 409 }));
      expect(said).not.toBe(english);
      expect(said).toMatch(/Muat ulang|Periksa lagi/);
    }
  });

  it("keep the server's message for anything else", () => {
    expect(describeFailure(new ApiError({ message: "Something else", code: "CONFLICT" }))).toBe("Something else");
  });
});
