import { describe, expect, it } from "vitest";
import { vendorMatches } from "./search";
import type { VendorView } from "../api/contract";

const v: VendorView = {
  id: "1", code: "VND-7", name: "UD. Sumber Logam", contactPerson: "Pak Hadi", phone: "0298-321",
  status: "atv", version: 1, createdAt: "", updatedAt: "",
};

describe("vendor search", () => {
  it("matches name, code, contact and phone, ignoring case and padding", () => {
    for (const term of ["sumber", "vnd-7", " HADI ", "0298"]) expect(vendorMatches(v, term)).toBe(true);
  });
  it("matches everything for an empty term and nothing for a stranger", () => {
    expect(vendorMatches(v, "  ")).toBe(true);
    expect(vendorMatches(v, "bengkel")).toBe(false);
  });
});
