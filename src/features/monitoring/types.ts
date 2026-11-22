import type { GeoVerdict } from "@/lib/geo";

export type DriverStatus =
  | "Dalam Perjalanan"
  | "Bongkar Muat"
  | "Standby"
  | "Selesai"
  | "Cuti";

export interface GeoPoint {
  lat: number;
  lng: number;
}

export interface DriverCard {
  id: string;
  name: string;
  /**
   * Index into the fleet palette. Derived from the truck's position in the full
   * roster, so filtering the board never repaints the remaining routes.
   */
  slot: number;
  plat: string;
  armada: string;
  kapasitas: number;
  status: DriverStatus;
  /** Cylinders loaded for the selected window. */
  muatan: number;
  tujuanOutlet?: string;
  eta?: string;
  lokasi?: string;
  durasi?: string;
  /** Surat jalan on this truck: how many done out of how many issued. */
  selesai: number;
  total: number;
}

/** How well the sopir's filing corroborated being at the outlet. */
export interface FilingLocation {
  verdict: GeoVerdict;
  jarakMeter?: number;
}

/** One surat jalan on the monitoring board. */
export interface MonitoringRow {
  id: string;
  kode: string;
  /** The stop's surat jalan, one per product. Proof photos hang off these. */
  suratJalan: { id: string; kode: string }[];
  outletId: string;
  outlet: string;
  alamat: string;
  driverId: string;
  driver: string;
  jamRencana: string;
  /**
   * Position in the driver's round, 1-based. The plan carries a stop's
   * *position*, not a clock time — `jamRencana` is empty against the real
   * service, so ordering the round by it would be a no-op that only worked
   * by accident of a stable sort. This is what actually orders it.
   */
  urutan: number;
  target: number;
  realisasi: number;
  pencapaianPersen: number;
  status: "Selesai" | "Proses" | "Antrian" | "Tertunda";
  coord: GeoPoint;
  /** From the most recent filing, when the driver's device supplied one. */
  lokasi?: FilingLocation;
  catatan?: string;
  /**
   * The optimistic-locking counter the http adapter reads off the board and
   * echoes back on a write.
   */
  version: number;
}

/**
 * One truck's run for the selected window: where it is now, and the stops it
 * still has to make. The map draws a route through these, so a standby truck
 * still shows the round it is about to drive.
 */
export interface MonitoringAssignment {
  id: string;
  driverId: string;
  /** Next stop — the one the truck is heading for. */
  outletId: string;
  driverCoord: GeoPoint;
  /** Remaining stops in delivery order, starting with the next one. */
  stops: GeoPoint[];
  /** True once the truck has left the yard. */
  berjalan: boolean;
  selesai: boolean;
}

/**
 * One surat jalan on a run, as closing the run sees it: the counts the driver
 * filed, which the office confirms or corrects before the run is closed.
 */
export interface RunDocument {
  id: string;
  kode: string;
  outlet: string;
  produk: string;
  /** What left the yard — the ceiling the other two add up to. */
  dimuat: number;
  diterima: number;
  kembali: number;
  status: "Antrian" | "Proses" | "Selesai" | "Tertunda";
  /** The run close has confirmed these counts. */
  dikonfirmasi: boolean;
  /**
   * Confirmed, with tabung that came back, but not yet credited and
   * restocked — "koreksi tagihan tertunda".
   */
  koreksiTertunda: boolean;
  notaKredit?: string;
  /** The plan these returned tabung were rescheduled onto ("RD-… · 18/11/2026"). */
  kirimUlang?: string;
}

/**
 * One truck's run (rit). Billing happens at dispatch for everything loaded;
 * closing the run is where the office confirms what each pangkalan kept, and
 * what came back is credited and returned to stock.
 */
export interface RunSummary {
  id: string;
  ritKe?: number;
  nomorRencana?: string;
  tanggalRencana?: string;
  driver: string;
  plat: string;
  berangkat?: string;
  kembali?: string;
  /** Left and not yet closed: the only state that can be closed. */
  bisaDitutup: boolean;
  dokumen: RunDocument[];
}

export interface MonitoringSnapshot {
  drivers: DriverCard[];
  rows: MonitoringRow[];
  assignments: MonitoringAssignment[];
  runs: RunSummary[];
  lastSyncAt: string;
  totals: {
    target: number;
    realisasi: number;
    selesai: number;
    proses: number;
    antrian: number;
    tertunda: number;
  };
}
