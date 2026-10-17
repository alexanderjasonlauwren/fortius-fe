import { formatRupiah } from "@/lib/format";
import { unitLabel } from "@/lib/lexicon";

/**
 * A transport-fee tariff is priced per tabung (client decision G5, the
 * default) or per kg -- each tariff and each claim line says which.
 */
export type RateBasis = "per_unit" | "per_kg";

export function rateBasisLabel(basis: RateBasis): string {
  return basis === "per_kg" ? "kg" : unitLabel();
}

/** "Rp 1.050/tabung", "Rp 354,64/kg". */
export function formatTariff(rate: number, basis: RateBasis): string {
  return `${formatRupiah(rate)}/${rateBasisLabel(basis)}`;
}
