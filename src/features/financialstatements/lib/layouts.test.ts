import { describe, expect, it } from "vitest";

import type { LayoutOption } from "../api/contract";
import { effectiveLayout, layoutsForPeriod } from "./layouts";

const layouts: LayoutOption[] = [
  { code: "neraca_v2", name: "Neraca", kind: "balance_sheet", isDefault: true },
  { code: "neraca", name: "Neraca (format 2025)", kind: "balance_sheet", isDefault: false },
  { code: "laba_rugi_v2", name: "Laporan Laba Rugi", kind: "profit_loss", isDefault: true },
  { code: "laba_rugi", name: "Laporan Laba Rugi (format 2025)", kind: "profit_loss", isDefault: false },
];

describe("the FY2025 format is offered only for 2025 (regression 2026-10-24 F14)", () => {
  it("offers it for a 2025 period", () => {
    expect(layoutsForPeriod(layouts, "balance_sheet", { from: "2025-12-31", to: "2025-12-31" }).map((l) => l.code))
      .toEqual(["neraca_v2", "neraca"]);
  });

  it("offers only the default for 2026, or a range reaching into it", () => {
    expect(layoutsForPeriod(layouts, "balance_sheet", { from: "2026-10-31", to: "2026-10-31" }).map((l) => l.code))
      .toEqual(["neraca_v2"]);
    expect(layoutsForPeriod(layouts, "profit_loss", { from: "2025-07-01", to: "2026-06-30" }).map((l) => l.code))
      .toEqual(["laba_rugi_v2"]);
  });

  it("drops a chosen 2025 format once the period moves out of 2025", () => {
    const offered2026 = layoutsForPeriod(layouts, "balance_sheet", { from: "2026-10-31", to: "2026-10-31" });
    expect(effectiveLayout("neraca", offered2026)).toBe("");
    const offered2025 = layoutsForPeriod(layouts, "balance_sheet", { from: "2025-12-31", to: "2025-12-31" });
    expect(effectiveLayout("neraca", offered2025)).toBe("neraca");
  });
});
