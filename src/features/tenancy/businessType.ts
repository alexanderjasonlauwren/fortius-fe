/**
 * Readable names for business-type codes.
 *
 * The code is what the backend keys categories and lexicon defaults off, so it
 * is what travels; this is only for display. Shared rather than repeated because
 * it was already in three places, and three copies of a label map is three
 * chances for one screen to say "water_depot" at a user.
 *
 * Against the real API this is redundant — the tenant response carries
 * `business_type_name`. It stays as the fallback for a code no one has
 * translated yet: an unknown code falls through unchanged, which reads
 * better than a dash and makes the gap obvious.
 */
const LABELS: Record<string, string> = {
  lpg_distribution: "Distribusi LPG",
  water_depot: "Depot Air Minum",
  holding: "Holding",
};

export function businessTypeLabel(code: string): string {
  return LABELS[code] ?? code;
}
