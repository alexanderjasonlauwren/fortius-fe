/**
 * The one place the straight-line monthly-charge formula lives on the
 * console side -- a line-for-line port of fortius-backend's own
 * internal/service/depreciation/depreciation.go (gap-closing plan, Phase
 * D). Needed here because the backend has no dry-run endpoint for posting
 * a depreciation run (CreateRun computes and posts in the same write, per
 * its own services.go header) -- a "preview before posting" has nowhere to
 * come from but this same arithmetic, run against the asset list already
 * on hand, in both api and mock modes alike.
 */

/** The standard straight-line charge: (cost-residual) / useful_life_months,
 *  rounded to the nearest whole rupiah. */
export function monthlyAmount(cost: number, residual: number, usefulLifeMonths: number): number {
  if (usefulLifeMonths <= 0) return 0;
  return Math.round((cost - residual) / usefulLifeMonths);
}

/** Which month of an asset's own schedule `period` ("YYYY-MM") is: 1 for
 *  the month depreciation_start_date falls in, 2 for the next, and so on. */
export function periodIndex(depreciationStartDate: string, period: string): number {
  const [startYear, startMonth] = depreciationStartDate.slice(0, 7).split("-").map(Number);
  const [periodYear, periodMonth] = period.split("-").map(Number);
  const startMonths = startYear * 12 + startMonth;
  const periodMonths = periodYear * 12 + periodMonth;
  return periodMonths - startMonths + 1;
}

/** The charge for one 1-indexed period of an asset's own schedule. Every
 *  period before the last charges the standard monthlyAmount; the last
 *  period absorbs whatever rounding left behind, so the cumulative total
 *  lands exactly on cost-residual. A periodIndex outside
 *  [1, usefulLifeMonths] charges nothing. */
export function chargeFor(
  cost: number,
  residual: number,
  usefulLifeMonths: number,
  index: number,
): number {
  if (index < 1 || index > usefulLifeMonths) return 0;
  const monthly = monthlyAmount(cost, residual, usefulLifeMonths);
  if (index < usefulLifeMonths) return monthly;
  return cost - residual - monthly * (usefulLifeMonths - 1);
}
