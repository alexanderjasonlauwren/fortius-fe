/**
 * The finance reconciliation ledger, against the real API.
 *
 * # A new backend endpoint, built for this screen
 *
 * There was no single resource to page by: a transaction here is a delivery
 * joined to the plan and schedule agreement it was drawn from and the
 * invoice and funding payment raised against it, and no existing list
 * endpoint returns that pre-joined. `GET /transactions`
 * (fortius-backend `internal/repository/transaction`) was added alongside
 * this adapter specifically to avoid an N+1 -- one delivery-shaped request
 * plus a lookup per row for its invoice and funding payment, on a screen
 * that can page a whole month.
 *
 * # Two vocabulary translations, each mirroring an existing one
 *
 * `statusKirim` maps the real 6-state `delivery_status` onto the console's
 * `DeliveryStatus` exactly the way `monitoringApi.http.ts`'s own
 * `toRowStatus` already does (duplicated rather than imported -- it is
 * three lines, and the two screens have no other reason to share code).
 * `statusBayar` maps `payment_status` onto `InvoiceStatus` exactly the way
 * `financeApi.http.ts`'s own `toInvoiceStatus` does, plus "Belum ditagih"
 * when the delivery has no invoice at all. Neither status has an `eq`-only
 * server-side filter that can express the console's coarser buckets
 * (`Selesai` covers both `delivered` and `partial`; `Lunas` covers `paid`,
 * `waived` and `credited`), so both, and `kecamatan` and `search` alongside
 * them, are applied client-side over one fetched page -- same trade
 * `getInvoices` already makes for its own status/bucket filters.
 *
 * # Fields the wire already resolves, and the two that stay a gap
 *
 * `rencana`, `nomorSA`, `bank`, `noRekening` and `diverifikasiOleh` all come
 * straight off `TransactionResponse` -- the backend's own join, not a
 * second lookup here. `jamRencana` stays empty: no planned-time-of-day
 * field exists anywhere in the schema, the same gap `monitoringApi.http.ts`
 * already carries for the same reason. An unbilled delivery's `nominal`
 * reads 0 rather than the mock's catalogue-price estimate -- the API has no
 * per-delivery unit price to estimate from, and 0 is honest about what has
 * actually been billed so far.
 */
import { getList } from "@/lib/api";
import { addDays, isoDate } from "@/lib/date";
import { getOutletList } from "@/features/outlet/api/outletApi";
import { getDrivers } from "@/features/drivers/api/driverApi";
import { exportCsv, exportExcel, timestampSuffix, type ExcelColumn } from "@/lib/export";
import type { DeliveryStatus, InvoiceStatus } from "@/types/domain";
import { outletLabelTitle, unitLabel } from "@/lib/lexicon";
import type {
  TransactionFilterOptions,
  TransactionFilters,
  TransactionRow,
  TransactionsApi,
  TransactionSummary,
} from "./contract";

/** 100 is every list definition's MaxPageSize; the server refuses more. */
const PAGE_SIZE = 100;

/** Mirrors the backend's TransactionResponse. */
interface TransactionResponse {
  id: string;
  delivery_number: string;
  invoice_id?: string;
  invoice_number?: string;
  plan_number: string;
  agreement_number: string;
  outlet_id: string;
  outlet_code: string;
  outlet_name: string;
  outlet_district?: string;
  driver_id: string;
  driver_name: string;
  plate: string;
  dispatched_qty: number;
  delivered_qty: number;
  delivery_status: string;
  total_amount?: number;
  payment_status?: string;
  paid_at?: string;
  bank_name?: string;
  bank_account_last4?: string;
  verified_by_name?: string;
  notes?: string;
  created_at: string;
}

/** Mirrors monitoringApi.http.ts's own toRowStatus -- see this file's header. */
function toDeliveryStatus(status: string): DeliveryStatus {
  switch (status) {
    case "delivered":
    case "partial":
      return "Selesai";
    case "on_route":
      return "Proses";
    case "failed":
      return "Tertunda";
    default:
      return "Antrian";
  }
}

/** Mirrors financeApi.http.ts's own toInvoiceStatus -- see this file's header. */
function toInvoiceStatus(paymentStatus: string): InvoiceStatus {
  switch (paymentStatus) {
    case "paid":
    case "waived":
    case "credited":
      return "Lunas";
    case "partial":
      return "Sebagian";
    case "overdue":
      return "Jatuh Tempo";
    default:
      return "Terbit";
  }
}

function toRow(r: TransactionResponse): TransactionRow {
  return {
    id: r.id,
    tanggal: r.created_at.slice(0, 10),
    suratJalan: r.delivery_number,
    invoice: r.invoice_number ?? "—",
    rencana: r.plan_number,
    nomorSA: r.agreement_number,
    outletId: r.outlet_id,
    outlet: r.outlet_name,
    kodeOutlet: r.outlet_code,
    kecamatan: r.outlet_district ?? "—",
    driverId: r.driver_id,
    driver: r.driver_name,
    plat: r.plate,
    // No planned-time-of-day field exists -- see this file's header.
    jamRencana: "",
    target: r.dispatched_qty,
    realisasi: r.delivered_qty,
    selisih: r.delivered_qty - r.dispatched_qty,
    nominal: r.total_amount ?? 0,
    bank: r.bank_name ?? "—",
    noRekening: r.bank_account_last4 ?? "—",
    statusKirim: toDeliveryStatus(r.delivery_status),
    statusBayar: r.payment_status ? toInvoiceStatus(r.payment_status) : "Belum ditagih",
    diverifikasiOleh: r.verified_by_name ?? "—",
    tanggalBayar: r.paid_at?.slice(0, 10) ?? "",
    keterangan: r.notes ?? "",
  };
}

/**
 * `filters.to` is inclusive, but the server's `date` filter compares `lte`
 * literally against midnight UTC of that day -- against `created_at`, a
 * timestamp, that excludes almost all of `to` itself (verified live: a
 * delivery at 16:52 UTC matched `gte` its own day but not `lte` it). The
 * exclusive `lt` bound one day later is the only one that reads "through the
 * end of `to`" correctly.
 */
async function fetchRows(filters?: TransactionFilters): Promise<TransactionRow[]> {
  const exclusiveEnd = filters?.to ? isoDate(addDays(new Date(`${filters.to}T00:00:00Z`), 1)) : undefined;
  const page = await getList<TransactionResponse>("/transactions", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "created_at", direction: "desc" }],
    filters: [
      ...(filters?.from ? [{ field: "date", operator: "gte" as const, value: filters.from }] : []),
      ...(exclusiveEnd ? [{ field: "date", operator: "lt" as const, value: exclusiveEnd }] : []),
      ...(filters?.outletId && filters.outletId !== "Semua"
        ? [{ field: "outlet_id", operator: "eq" as const, value: filters.outletId }]
        : []),
      ...(filters?.driverId && filters.driverId !== "Semua"
        ? [{ field: "driver_id", operator: "eq" as const, value: filters.driverId }]
        : []),
    ],
  });
  let rows = page.items.map(toRow);

  // Bucket statuses and free-text outlet/driver/plate search have no
  // eq-only server-side equivalent -- see this file's header.
  if (filters?.statusKirim && filters.statusKirim !== "Semua") {
    rows = rows.filter((r) => r.statusKirim === filters.statusKirim);
  }
  if (filters?.statusBayar && filters.statusBayar !== "Semua") {
    rows = rows.filter((r) => r.statusBayar === filters.statusBayar);
  }
  if (filters?.kecamatan && filters.kecamatan !== "Semua") {
    rows = rows.filter((r) => r.kecamatan === filters.kecamatan);
  }
  if (filters?.search) {
    const q = filters.search.toLowerCase();
    rows = rows.filter(
      (r) =>
        r.suratJalan.toLowerCase().includes(q) ||
        r.invoice.toLowerCase().includes(q) ||
        r.outlet.toLowerCase().includes(q) ||
        r.kodeOutlet.toLowerCase().includes(q) ||
        r.driver.toLowerCase().includes(q) ||
        r.plat.toLowerCase().includes(q),
    );
  }
  return rows;
}

async function getTransactions(filters?: TransactionFilters): Promise<TransactionRow[]> {
  return fetchRows(filters);
}

async function getTransactionSummary(filters?: TransactionFilters): Promise<TransactionSummary> {
  const rows = await fetchRows(filters);
  const sumWhere = (status: string) =>
    rows.filter((r) => r.statusBayar === status).reduce((s, r) => s + r.nominal, 0);

  return {
    jumlah: rows.length,
    unit: rows.reduce((s, r) => s + r.realisasi, 0),
    nilai: rows.reduce((s, r) => s + r.nominal, 0),
    terverifikasi: sumWhere("Lunas"),
    menunggu: sumWhere("Terbit") + sumWhere("Sebagian"),
    ditolak: sumWhere("Jatuh Tempo"),
    belumDitagih: sumWhere("Belum ditagih"),
    outlet: new Set(rows.map((r) => r.outletId)).size,
  };
}

/**
 * Options for the filter bar. Reads the real outlet and driver lists
 * (complete, not just what happens to be on the current page) rather than
 * deriving them from fetched rows -- an outlet or driver with zero
 * transactions this period should still be choosable, same as the mock's
 * own `getTransactionFilterOptions`.
 *
 * The driver label carries no plate: `driverApi`'s own contract states why
 * -- a driver has no static truck, only whichever one it used on a given
 * delivery, and a filter option is not one delivery.
 */
async function getTransactionFilterOptions(): Promise<TransactionFilterOptions> {
  const [outlets, drivers] = await Promise.all([getOutletList(), getDrivers()]);
  return {
    outlet: outlets
      .map((o) => ({ id: o.id, label: o.nama }))
      .sort((a, b) => a.label.localeCompare(b.label)),
    kecamatan: [...new Set(outlets.map((o) => o.kecamatan))].sort(),
    drivers: drivers
      .map((d) => ({ id: d.id, label: d.nama }))
      .sort((a, b) => a.label.localeCompare(b.label)),
  };
}

/** Column layout shared by both exports, so the files match the table. */
const EXPORT_COLUMNS: ExcelColumn<TransactionRow>[] = [
  { header: "Tanggal", value: (r) => new Date(r.tanggal), type: "date", width: 12 },
  { header: "Jam", value: (r) => r.jamRencana, width: 7 },
  { header: "Surat Jalan", value: (r) => r.suratJalan, width: 20 },
  { header: "Invoice", value: (r) => r.invoice, width: 20 },
  { header: "Rencana", value: (r) => r.rencana, width: 15 },
  { header: "Nomor SA", value: (r) => r.nomorSA, width: 16 },
  { header: `Kode ${outletLabelTitle()}`, value: (r) => r.kodeOutlet, width: 14 },
  { header: outletLabelTitle(), value: (r) => r.outlet, width: 26 },
  { header: "Kecamatan", value: (r) => r.kecamatan, width: 16 },
  { header: "Sopir", value: (r) => r.driver, width: 18 },
  { header: "Plat", value: (r) => r.plat, width: 12 },
  { header: `Target (${unitLabel()})`, value: (r) => r.target, type: "number", width: 13 },
  { header: `Realisasi (${unitLabel()})`, value: (r) => r.realisasi, type: "number", width: 15 },
  { header: "Selisih", value: (r) => r.selisih, type: "number", width: 10 },
  { header: "Nominal", value: (r) => r.nominal, type: "currency", width: 16 },
  { header: "Bank", value: (r) => r.bank, width: 10 },
  { header: "No. Rekening", value: (r) => r.noRekening, width: 18 },
  { header: "Status Pengiriman", value: (r) => r.statusKirim, width: 16 },
  { header: "Status Pembayaran", value: (r) => r.statusBayar, width: 18 },
  { header: "Diverifikasi Oleh", value: (r) => r.diverifikasiOleh, width: 18 },
  {
    header: "Tanggal Bayar",
    value: (r) => (r.tanggalBayar ? new Date(r.tanggalBayar) : null),
    type: "date",
    width: 14,
  },
  { header: "Keterangan", value: (r) => r.keterangan, width: 34 },
];

async function exportTransactionsExcel(filters?: TransactionFilters): Promise<number> {
  const rows = await fetchRows(filters);
  exportExcel(`daftar-penjualan-${timestampSuffix()}`, "Daftar Penjualan", EXPORT_COLUMNS, rows);
  return rows.length;
}

async function exportTransactionsCsv(filters?: TransactionFilters): Promise<number> {
  const rows = await fetchRows(filters);
  exportCsv(
    `daftar-penjualan-${timestampSuffix()}`,
    EXPORT_COLUMNS.map((c) => c.header),
    rows.map((row) =>
      EXPORT_COLUMNS.map((c) => {
        const v = c.value(row);
        if (v instanceof Date) return v.toLocaleDateString("id-ID");
        return v ?? "";
      }),
    ),
  );
  return rows.length;
}

export const transactionApiHttp: TransactionsApi = {
  getTransactions,
  getTransactionSummary,
  getTransactionFilterOptions,
  exportTransactionsExcel,
  exportTransactionsCsv,
};
