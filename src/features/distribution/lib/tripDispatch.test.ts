import { describe, expect, it } from "vitest";
import { runCanBeDispatched } from "./tripDispatch";

describe("which runs offer Berangkatkan", () => {
  it("offers it only for a run that hasn't left", () => {
    expect(runCanBeDispatched("planned")).toBe(true);
    expect(runCanBeDispatched(undefined)).toBe(true);
  });

  it("never offers it once the run has left, closed or been cancelled", () => {
    for (const status of ["dispatched", "completed", "cancelled"]) {
      expect(runCanBeDispatched(status)).toBe(false);
    }
  });
});
