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
   * Required for "Tertunda": `POST /deliveries/:id/fail` refuses a failure
   * nobody explained, and the database agrees
   * (`ck_deliveries_failure_reason`), so the dialog always supplies one.
   */
  catatan?: string;
}

export interface MonitoringApi {
  getMonitoringSnapshot(dateRange: DateRange): Promise<MonitoringSnapshot>;
  getDriverCards(dateRange: DateRange): Promise<DriverCard[]>;
  getMonitoringTable(dateRange: DateRange): Promise<MonitoringRow[]>;
  setDeliveryStatus(input: SetDeliveryStatusInput): Promise<StatusReceipt>;
  /** Prints the surat jalan a stop's row carries. */
  printSuratJalan(rowId: string): Promise<void>;
}

export type { DriverCard, MonitoringAssignment, MonitoringRow, MonitoringSnapshot };
