/**
 * What every monitoring adapter must provide.
 *
 * The domain shape screens read; the HTTP adapter maps the wire onto it.
 *
 * **Adapters return domain types.** The wire shape never escapes the HTTP
 * adapter.
 */
import type {
  DriverCard,
  MonitoringAssignment,
  MonitoringRow,
  MonitoringSnapshot,
  RunSummary,
} from "../types";

export interface DateRange {
  from: string;
  to: string;
}

/**
 * What a status write hands back to the board.
 *
 * A stop, not a document: the board's rows are visits, and one visit can
 * close several surat jalan. `kode` carries every one of them, the same way
 * the row it came from does — a dispatcher telling somebody over the radio
 * which papers just closed needs all of them, not the first.
 */
export interface StatusReceipt {
  kode: string;
  status: MonitoringRow["status"];
  realisasi: number;
}

export interface SetDeliveryStatusInput {
  /** The row's id — the stop's id, which is its first document's uuid. */
  deliveryId: string;
  /**
   * "Antrian" is deliberately not offered: a truck that has left cannot be
   * un-departed, the service has no endpoint for it, and the board has no
   * button for it either. A status this type can express but nothing can
   * perform is a defect waiting to be found.
   */
  status: "Proses" | "Selesai" | "Tertunda";
  realisasi?: number;
  /**
   * Who took the load, required for "Selesai" when anything was handed over:
   * `POST /deliveries/:id/complete` refuses a drop with nobody named
   * (`RECIPIENT_REQUIRED`, Round 3 R3-9).
   */
  diterimaOleh?: string;
  /**
   * Required for "Tertunda": `POST /deliveries/:id/fail` refuses a failure
   * nobody explained, and the database agrees
   * (`ck_deliveries_failure_reason`), so the dialog always supplies one.
   */
  catatan?: string;
}

/** One surat jalan whose counts the office corrects at close. */
export interface RunCount {
  deliveryId: string;
  diterima: number;
  kembali: number;
  catatan?: string;
}

export interface CloseRunInput {
  runId: string;
  /** Only the corrected surat jalan; the rest keep the driver's filing. */
  koreksi: RunCount[];
}

/** What closing a run did to one surat jalan's books. */
export interface ClosedDocument {
  id: string;
  kode: string;
  outlet?: string;
  diterima: number;
  kembali: number;
  dikoreksi: boolean;
  notaKredit?: string;
  nilaiKredit: number;
  keTitipan: number;
  /** The books correction failed and waits for a retry; `alasan` says why. */
  tertunda: boolean;
  alasan?: string;
}

export interface CloseRunResult {
  dokumen: ClosedDocument[];
  rencanaSelesai: boolean;
}

export interface ReturnBookingResult {
  notaKredit?: string;
  nilaiKredit: number;
  keTitipan: number;
  sudahDibukukan: boolean;
}

/** Kirim ulang: the surat jalan and the day its returned tabung go out. */
export interface RedeliverInput {
  deliveryId: string;
  /** yyyy-mm-dd */
  tanggal: string;
}

export interface RedeliveryResult {
  rencanaId: string;
  rencana: string;
  tanggal: string;
  jumlah: number;
  /** No suitable draft existed for the day, so one was opened. */
  rencanaBaru: boolean;
}

export interface MonitoringApi {
  getMonitoringSnapshot(dateRange: DateRange): Promise<MonitoringSnapshot>;
  getDriverCards(dateRange: DateRange): Promise<DriverCard[]>;
  getMonitoringTable(dateRange: DateRange): Promise<MonitoringRow[]>;
  setDeliveryStatus(input: SetDeliveryStatusInput): Promise<StatusReceipt>;
  /** Prints the surat jalan a stop's row carries. */
  printSuratJalan(rowId: string): Promise<void>;
  /** Closes a run, confirming (and where needed correcting) its counts. */
  closeRun(input: CloseRunInput): Promise<CloseRunResult>;
  /** Retries a closed surat jalan's books correction. */
  bookReturn(deliveryId: string): Promise<ReturnBookingResult>;
  /** Plans a closed surat jalan's returned tabung onto a later day. */
  redeliver(input: RedeliverInput): Promise<RedeliveryResult>;
}

export type { DriverCard, MonitoringAssignment, MonitoringRow, MonitoringSnapshot, RunSummary };
