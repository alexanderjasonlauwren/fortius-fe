import { describe, expect, it } from "vitest";
import { ApiError } from "@/lib/api";
import { describeFailure } from "./useDeskMutation";

describe("failure messages", () => {
  it("say a locked period in the desk's words, by code", () => {
    const closed = new ApiError({ message: "The period 2026-09 is closed; date the entry in an open month", code: "PERIOD_CLOSED", status: 409 });
    expect(describeFailure(closed)).toMatch(/sudah ditutup/);
    const review = new ApiError({ message: "x", code: "PERIOD_IN_REVIEW", status: 409 });
    expect(describeFailure(review)).toMatch(/sedang direview/);
  });

  it("keep the server's message for anything else", () => {
    expect(describeFailure(new ApiError({ message: "Something else", code: "CONFLICT" }))).toBe("Something else");
  });
});
