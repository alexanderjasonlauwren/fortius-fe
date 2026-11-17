/**
 * Where the sopir was when they filed something.
 *
 * The point of this is not tracking — it is corroboration. A completion filed
 * four kilometres from the outlet is either a mis-tap or a delivery that did
 * not happen, and that is the only question these coordinates are asked.
 *
 * So position is captured at the moment of submission and nowhere else, on
 * every filing, unconditionally. Nothing in this file starts a continuous
 * watch, and nothing here needs the driver's permission beyond the one
 * browser prompt a single reading asks for.
 *
 * # The different conversation
 *
 * A continuous watch answers a different question — not "was this filing
 * genuine" but "where has this truck been all day" — and that conversation with
 * the people driving the trucks has now happened: `features/sopir/lib/gpsStream.ts`
 * and `useGpsStream` are it. Recording there is off by default, per run, and
 * starts only when the driver presses a button that says so — never inferred
 * from an open stop or any other piece of app state. If you are reaching for
 * `watchPosition`, that is almost certainly where it belongs, not here.
 */

export type GeoFixStatus =
  | "ok"
  /** The driver refused the browser prompt. Itself a signal, not an error. */
  | "ditolak"
  /** Device has no fix — indoors, tunnel, warehouse, airplane mode. */
  | "tidak-tersedia"
  | "waktu-habis"
  /** No geolocation API: an old browser, or a page not served over HTTPS. */
  | "tidak-didukung"
  /** Recording is switched off for this agency. */
  | "nonaktif";

export interface GeoStamp {
  status: GeoFixStatus;
  lat?: number;
  lng?: number;
  /** Radius of uncertainty in metres, as reported by the device. */
  akurasi?: number;
  at: string;
}

export const GEO_STATUS_LABEL: Record<GeoFixStatus, string> = {
  ok: "Lokasi terekam",
  ditolak: "Izin lokasi ditolak",
  "tidak-tersedia": "Sinyal GPS tidak tersedia",
  "waktu-habis": "Lokasi tidak terbaca tepat waktu",
  "tidak-didukung": "Perangkat tidak mendukung lokasi",
  nonaktif: "Perekaman lokasi dimatikan",
};

/**
 * A fix, or an honest account of why there isn't one.
 *
 * Never rejects, and never blocks for long. A driver at a gate with no signal
 * still has to be able to close the drop — refusing the submission would stop
 * the delivery being recorded at all, which costs far more than the missing
 * coordinate it was trying to enforce.
 */
export function capturePosition(options?: {
  aktif?: boolean;
  timeoutMs?: number;
}): Promise<GeoStamp> {
  const at = new Date().toISOString();

  if (options?.aktif === false) {
    return Promise.resolve({ status: "nonaktif", at });
  }
  // Also the branch taken on plain HTTP: browsers withhold the API entirely
  // outside a secure context, so a deployment served over http records nothing.
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return Promise.resolve({ status: "tidak-didukung", at });
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (pos) =>
        resolve({
          status: "ok",
          lat: pos.coords.latitude,
          lng: pos.coords.longitude,
          akurasi: pos.coords.accuracy,
          at: new Date().toISOString(),
        }),
      (err) =>
        resolve({
          status:
            err.code === err.PERMISSION_DENIED
              ? "ditolak"
              : err.code === err.TIMEOUT
                ? "waktu-habis"
                : "tidak-tersedia",
          at: new Date().toISOString(),
        }),
      {
        enableHighAccuracy: true,
        timeout: options?.timeoutMs ?? 8000,
        // A fix from the last half-minute is the same fix for this purpose, and
        // returns instantly instead of waking the GPS chip again.
        maximumAge: 30_000,
      },
    );
  });
}

const EARTH_RADIUS_M = 6_371_000;

/**
 * The corroboration radius when no tenant in the chain has set one. Shared by
 * the monitoring board and the driver's own screen, so a stop the board calls
 * "jauh" is the same stop the driver was warned about.
 */
export const DEFAULT_GEOFENCE_RADIUS_M = 150;

/** Great-circle distance in metres. */
export function distanceMeters(
  a: { lat: number; lng: number },
  b: { lat: number; lng: number },
): number {
  const toRad = (d: number) => (d * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return Math.round(2 * EARTH_RADIUS_M * Math.asin(Math.sqrt(h)));
}

export type GeoVerdict = "sesuai" | "jauh" | "kasar" | "tanpa-lokasi";

/**
 * Whether a fix corroborates being at the outlet.
 *
 * Accuracy is part of the judgement, not decoration: a fix good to ±2 km cannot
 * confirm or deny a 150 m geofence, and calling that "jauh" would accuse a
 * driver of something a cell-tower triangulation simply cannot establish.
 */
export function geoVerdict(
  stamp: GeoStamp | undefined,
  jarakMeter: number | undefined,
  radiusMeter: number,
): GeoVerdict {
  if (!stamp || stamp.status !== "ok" || jarakMeter == null) return "tanpa-lokasi";
  const akurasi = stamp.akurasi ?? 0;
  if (akurasi > radiusMeter * 3) return "kasar";
  // Give the device the benefit of its own stated error before flagging anyone.
  return jarakMeter <= radiusMeter + akurasi ? "sesuai" : "jauh";
}

/** "180 m" / "4,2 km" */
export function formatDistance(meters: number): string {
  if (meters < 1000) return `${Math.round(meters)} m`;
  return `${(meters / 1000).toLocaleString("id-ID", { maximumFractionDigits: 1 })} km`;
}
