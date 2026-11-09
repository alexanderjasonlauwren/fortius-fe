/**
 * The sopir's own view of the day.
 *
 * Deliberately not the monitoring shape: the board answers "where is everyone",
 * this answers "what do I do next, and what must I write down". So it carries
 * the outlet's phone number and coordinates — the two things a driver actually
 * reaches for — and drops the fleet-wide aggregates entirely.
 */

import type { GeoStamp, GeoVerdict } from "@/lib/geo";

export type StopStage = "Antrian" | "Proses" | "Selesai" | "Tertunda";

/** Where a filing came from, as the driver's own card shows it back to them. */
export interface StopFiling {
  tipe: "berangkat" | "tiba" | "selesai" | "tertunda";
  at: string;
  posisi: GeoStamp;
  jarakMeter?: number;
  verdict: GeoVerdict;
}

/** One product on a stop, as the sopir counts it off the truck. */
export interface StopLine {
  productId: string;
  nama: string;
  satuan: string;
  returnable: boolean;
  target: number;
  realisasi: number;
  kembali?: number;
}

export interface RunStop {
  id: string;
  /** Surat jalan number — what the outlet signs against. */
  kode: string;
  /** Position in today's run, 1-based. */
  urutan: number;
  outletId: string;
  outlet: string;
  alamat: string;
  kecamatan: string;
  telepon: string;
  penanggungJawab: string;
  lat: number;
  lng: number;
  jamRencana: string;
  lines: StopLine[];
  target: number;
  realisasi: number;
  unitKembali?: number;
  diterimaOleh?: string;
  status: StopStage;
  catatan?: string;
  /**
   * When the driver filed their arrival, if they did.
   *
   * Not a fifth `StopStage`: arriving does not change what the stop is, it
   * records when the waiting started. The card uses it to decide which of the
   * two buttons to offer, and the office uses the gap to it from departure.
   */
  tibaPada?: string;
  selesaiPada?: string;
  /** Newest first. Empty until the sopir files something from a device. */
  filings: StopFiling[];
}

export interface RunTotals {
  singgah: number;
  selesai: number;
  tertunda: number;
  /** Stops neither delivered nor written off — the work still owed today. */
  sisa: number;
  muatan: number;
  terkirim: number;
  kembali: number;
  kapasitas: number;
}

export interface DriverRun {
  /** Whether this agency records position at all — see OperationsEntity. */
  rekamLokasi: boolean;
  driver: {
    id: string;
    nama: string;
    plat: string;
    armada: string;
    kapasitas: number;
    status: string;
  } | null;
  /**
   * The signed-in person's seat on this run. A kernet works the same stops
   * under their own login, but the continuous route is recorded from the
   * driver's phone only: two phones in one cab would file the trip twice.
   */
  peran: "Sopir" | "Kernet";
  /** The kernet riding this run, if any. */
  kernet?: string;
  tanggal: string;
  stops: RunStop[];
  totals: RunTotals;
  /** The stop the driver is on, or heading to. Null once the run is closed. */
  stopBerikutId: string | null;
}

