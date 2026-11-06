/**
 * What every driver-screen adapter must provide.
 *
 * The domain shape screens read; the HTTP adapter maps the wire onto it.
 */
import type { Filing, ReplayResult } from "../lib/outbox";
import type { DriverRun } from "../types";

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
  /**
   * Saved on this device and not yet with the server: no signal. It is sent
   * on its own when the phone is back online.
   */
  tertunda?: boolean;
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
   * `driverId` is ignored: the run comes from
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

  /** Filings saved on this device and not yet with the server, oldest first. */
  pendingFilings(): Promise<Filing[]>;
  /** Sends what is waiting; safe to call at any time. */
  replayFilings(): Promise<ReplayResult>;
  /** Drops a filing the server refused, once the driver has seen why. */
  discardFiling(id: string): Promise<void>;


  /**
   * Reports a batch of positions for the caller's own currently-dispatched
   * run. There is no trip id in the input — the service resolves it from the
   * session, the same way `getMyRun` does.
   */
  postGpsFixes(fixes: GpsFixInput[]): Promise<void>;
}
