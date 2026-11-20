import { describe, expect, it } from "vitest";
import { monthFromFileName, monthLabel } from "./period";

describe("the month an Acuan SA file names", () => {
  it("reads the client's file name, typo and all", () => {
    // The real file says "Novembver 2026" first and "November 2026" after.
    expect(monthFromFileName("Acuan Base SA Novembver 2026 PT. Bhakta Dharma Anindita  - Acuan Base SA November 2026 PT. BDA .pdf"))
      .toBe("2026-11");
    expect(monthFromFileName("acuan base sa januari 2027.pdf")).toBe("2027-01");
  });

  it("suggests nothing when the name carries no month", () => {
    expect(monthFromFileName("scan_0001.pdf")).toBeNull();
  });

  it("labels a month in Bahasa", () => {
    expect(monthLabel("2026-11")).toBe("November 2026");
  });
});
