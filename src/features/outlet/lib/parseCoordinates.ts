/**
 * Reads a pasted "lat, lng" pair — the format Google Maps' own "Copy
 * coordinates" puts on the clipboard — into a plain lat/lng pair.
 *
 * Returns null for anything that is not exactly that shape, rather than
 * guessing at a looser format: a coordinate pasted from the wrong place is a
 * pin planted somewhere real but wrong, and the wrong shape is easier to
 * notice than the wrong number.
 */
export function parseCoordinatePaste(text: string): { lat: number; lng: number } | null {
  const match = text.trim().match(/^(-?\d+(?:\.\d+)?)\s*,\s*(-?\d+(?:\.\d+)?)$/);
  if (!match) return null;
  const lat = Number(match[1]);
  const lng = Number(match[2]);
  if (!Number.isFinite(lat) || !Number.isFinite(lng)) return null;
  return { lat, lng };
}

/**
 * Indonesia's rough bounding box (Sabang to Merauke, plus a margin).
 *
 * The same check the backend applies to `latitude`/`longitude` -- see
 * `entities/outlet/entities.go`. Checking it here too catches a mistyped or
 * swapped pair before a round trip to the server is needed to say so.
 */
export function isWithinIndonesia(lat: number, lng: number): boolean {
  return lat >= -11 && lat <= 6 && lng >= 95 && lng <= 141;
}
