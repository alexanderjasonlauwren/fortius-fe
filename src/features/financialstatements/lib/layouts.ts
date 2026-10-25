import type { LayoutOption } from "../api/contract";

/** The year the kept, non-default formats were drawn for. */
const LEGACY_LAYOUT_YEAR = 2025;

/**
 * The formats a statement for this period may be drawn on. The default is
 * always offered. The FY2025 format predates chart v3 -- it places neither
 * 2-1050 Hutang Dagang Pertamina nor 1-1700 Pajak Dibayar Dimuka -- so a
 * 2026 Neraca drawn on it does not balance (regression 2026-10-24 F14); it
 * is offered only for a period wholly inside 2025.
 */
export function layoutsForPeriod(
  layouts: readonly LayoutOption[],
  kind: LayoutOption["kind"],
  period: { from: string; to: string },
): LayoutOption[] {
  const in2025 = (d: string) => Number(d.slice(0, 4)) === LEGACY_LAYOUT_YEAR;
  return layouts.filter((l) => l.kind === kind && (l.isDefault || (in2025(period.from) && in2025(period.to))));
}

/** The layout code to request: the chosen one while the period still offers it, else the default (""). */
export function effectiveLayout(chosen: string, offered: readonly LayoutOption[]): string {
  return chosen !== "" && offered.some((l) => !l.isDefault && l.code === chosen) ? chosen : "";
}
