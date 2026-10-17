import { unitLabel } from "@/lib/lexicon";

/**
 * A transport-fee tariff is priced per kg -- the BA LO Pertamina pays on,
 * Rp 354,64/kg in March 2026 -- or per tabung; each tariff and each claim
 * line says which.
 */
export type RateBasis = "per_unit" | "per_kg";

export function rateBasisLabel(basis: RateBasis): string {
  return basis === "per_kg" ? "kg" : unitLabel();
}

/** Rupiah to the sen when a rate has them: a per-kg rate is 354,64, not 355. */
export function formatRate(rate: number): string {
  return `Rp ${rate.toLocaleString("id-ID", { minimumFractionDigits: Number.isInteger(rate) ? 0 : 2, maximumFractionDigits: 2 })}`;
}

/** "Rp 1.050/tabung", "Rp 354,64/kg". */
export function formatTariff(rate: number, basis: RateBasis): string {
  return `${formatRate(rate)}/${rateBasisLabel(basis)}`;
}
