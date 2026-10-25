/**
 * What every transactions adapter must provide.
 *
 * Split out of a single `transactionApi.ts` now that a real adapter exists
 * (fortius-backend gained a general `GET /transactions` endpoint
 * specifically for this -- see `transactionApi.http.ts`'s own header).
 * `defaultRange` stays here rather than in either adapter: it is pure date
 * arithmetic with no data source of its own, the same reason
 * `reports/contract.ts` holds `resolveRange`.
 */
import { isoDate, startOfToday } from "@/lib/date";
import type { DeliveryStatus, InvoiceStatus } from "@/types/domain";

/**
 * One line of the finance ledger.
 *
 * A transaction is a delivery and the invoice raised against it, flattened
 * into a single row -- that is the grain finance actually reconciles
 * against.
 */
export interface TransactionRow {
  id: string;
  tanggal: string;
  suratJalan: string;
  invoice: string;
  rencana: string;
  nomorSA: string;
  outletId: string;
  outlet: string;
  kodeOutlet: string;
  kecamatan: string;
  driverId: string;
  driver: string;
  plat: string;
  jamRencana: string;
  target: number;
  realisasi: number;
  selisih: number;
  nominal: number;
  bank: string;
  noRekening: string;
  statusKirim: DeliveryStatus | "—";
  statusBayar: InvoiceStatus | "Belum ditagih";
  diverifikasiOleh: string;
  tanggalBayar: string;
  keterangan: string;
}

export interface TransactionFilters {
  from?: string;
  to?: string;
  search?: string;
  outletId?: string;
  kecamatan?: string;
  driverId?: string;
  statusKirim?: string;
  statusBayar?: string;
}

export interface TransactionSummary {
  jumlah: number;
  unit: number;
  nilai: number;
  terverifikasi: number;
  menunggu: number;
  ditolak: number;
  belumDitagih: number;
  outlet: number;
}

export interface TransactionFilterOption {
  id: string;
  label: string;
}

export interface TransactionFilterOptions {
  outlet: TransactionFilterOption[];
  kecamatan: string[];
  drivers: TransactionFilterOption[];
}

/** Default window: the current calendar month. */
export function defaultRange(): { from: string; to: string } {
  const today = startOfToday();
  return {
    from: isoDate(new Date(today.getFullYear(), today.getMonth(), 1)),
    to: isoDate(today),
  };
}

export interface TransactionsApi {
  getTransactions(filters?: TransactionFilters): Promise<TransactionRow[]>;
  getTransactionSummary(filters?: TransactionFilters): Promise<TransactionSummary>;
  getTransactionFilterOptions(): Promise<TransactionFilterOptions>;
  exportTransactionsExcel(filters?: TransactionFilters): Promise<number>;
  exportTransactionsCsv(filters?: TransactionFilters): Promise<number>;
}
