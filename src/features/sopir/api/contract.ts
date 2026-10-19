/**
 * What every driver-screen adapter must provide.
 *
 * Same reason as `features/sa/api/contract.ts`: without a contract the mock and
 * the HTTP adapter drift, and the drift shows up only on whichever screen reads
 * the field one of them forgot. Here that screen is a phone at a pangkalan
 * gate, which is the worst place to find out.
 */
import type { DriverOption, DriverRun } from "../types";

/**
 * What a filing hands back to the screen.
 *
 * `kode` is every surat jalan the stop covers, because a stop with two
 * cylinder sizes has two documents and the driver hands over both. `realisasi`
 * is the count that ends up on the outlet's bill.
 */
export interface StopReceipt {
  kode: string;
  realisasi: number;
  /**
   * Why the proof photo did not upload, when one was given and failed. The
   * stop is closed either way: a lost photo must not undo a delivery that
   * happened.
   */
  fotoGagal?: string;
}

export interface CompleteStopInput {
  deliveryId: string;
  /** Per product — the sopir unloaded it, so they know the breakdown. */
  lines: { productId: string; realisasi: number; kembali?: number }[];
  diterimaOleh: string;
  catatan?: string;
  /** A photo of the drop, attached to the stop's first surat jalan. */
  foto?: File;
}

/**
 * One reported position, as the run tracker captures it.
 *
 * This is not `@/lib/geo.ts`'s corroboration read — that fixes one instant at
 * the moment of a filing. This is the driver's own choice to share their
 * route while a run is open, one batch at a time.
 */
export interface GpsFixInput {
  /** Device timestamp at capture, ISO. */
  at: string;
  lat: number;
  lng: number;
  speedKmh?: number;
  heading?: number;
  accuracy?: number;
}

export interface SopirApi {
  /**
   * One driver's run for a day.
   *
   * `driverId` is what the *mock* narrows by, and what the demo's driver picker
   * supplies. Against the service it is ignored: the run comes from
   * `GET /deliveries/mine`, which resolves the driver from the session. Two
   * drivers in one branch are the same tenant, so no policy separates them —
   * an id in flight would be an id a caller could change.
   */
  getMyRun(driverId: string, tanggal?: string): Promise<DriverRun>;

  departStop(deliveryId: string): Promise<StopReceipt>;
  /**
   * At the gate, before anything is unloaded.
   *
   * Separate from `completeStop` because they are separate facts. A driver can
   * wait at a pangkalan while somebody finds the person who signs, and that
   * wait is what a delay report is made of — folded into the completion it
   * reads as zero, every time, for every agency.
   */
  arriveStop(deliveryId: string): Promise<StopReceipt>;
  completeStop(input: CompleteStopInput): Promise<StopReceipt>;
  /** Could not deliver. Leaves the stop open and raises no invoice. */
  holdStop(input: { deliveryId: string; catatan: string }): Promise<StopReceipt>;

  /**
   * Fleet list for accounts that are not themselves a sopir — a dispatcher
   * covering the radio, or an admin checking what the driver sees.
   */
  getDriverOptions(): Promise<DriverOption[]>;

  /**
   * Reports a batch of positions for the caller's own currently-dispatched
   * run. There is no trip id in the input — the service resolves it from the
   * session, the same way `getMyRun` does.
   */
  postGpsFixes(fixes: GpsFixInput[]): Promise<void>;
}
