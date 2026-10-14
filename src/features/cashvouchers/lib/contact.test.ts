import { describe, expect, it } from "vitest";
import { contactValue, parseContact } from "./contact";

describe("voucher contact", () => {
  it("round-trips a vendor and a pangkalan", () => {
    expect(parseContact(contactValue({ supplierId: "sup-1" }))).toEqual({ supplierId: "sup-1" });
    expect(parseContact(contactValue({ outletId: "out-1" }))).toEqual({ outletId: "out-1" });
  });

  it("prefers the vendor and reads no contact as none", () => {
    expect(contactValue({ supplierId: "sup-1", outletId: "out-1" })).toBe("s:sup-1");
    expect(contactValue({})).toBe("");
    expect(parseContact("")).toEqual({});
  });
});
