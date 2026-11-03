import { describe, expect, it } from "vitest";
import { activityLabel } from "./activityLabel";

describe("activityLabel", () => {
  it("says what happened for a route a person uses every day", () => {
    expect(activityLabel("payments", "verify", "create")).toBe("Penerimaan kas diverifikasi");
    expect(activityLabel("distribution", "dispatch", "create")).toBe("Rit diberangkatkan");
  });

  it("falls back to a plain subject and verb rather than nothing", () => {
    expect(activityLabel("outlets", "outlets", "update")).toBe("Data pangkalan diubah");
    expect(activityLabel("geofence-rules", "geofence-rules", "delete")).toBe("Geofence rules dihapus");
  });
});
