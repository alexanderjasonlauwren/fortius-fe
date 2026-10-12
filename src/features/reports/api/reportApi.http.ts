/**
 * Reports, against the real API.
 *
 * # The backend gap this closed
 *
 * `core.deliveries` had no general list endpoint at all until this step --
 * only `/deliveries/mine` (self-scoped to the signed-in driver),
 * `/distribution/orders/:id/deliveries` (one plan) and `/distribution/trips/:id/dispatch`.
 * None of those can answer "every delivery in this date range", which is
 * what every figure below actually needs. `GET /deliveries` (fortius-backend
 * `internal/repository/delivery/list_definition.go`) was added alongside
 * this adapter for exactly that -- filterable by `date` (an alias for
 * `created_at`, the day the surat jalan was raised, not its departure or
 * completion timestamps, which are null until the run reaches that stage),
 * `outlet_id`, `driver_id`, `product_id` and `delivery_status`.
 *
 * # Mapping from the real lifecycle onto the mock's two-state one
 *
 * The mock's `deliveries` rows carry a binary `Selesai | Tertunda`.
 * `core.deliveries.delivery_status` is `pending | on_route | delivered |
 * partial | failed | cancelled`. `delivered` maps to Selesai and
 * `pending`/`on_route` map to Tertunda -- `partial`, `failed` and
 * `cancelled` map to neither, which is more honest than forcing them into
 * one bucket: `suratJalanSelesai + suratJalanTertunda` can be less than
 * `suratJalan` in this build, where it always equalled it in the mock.
 *
 * `target`/`realisasi` per delivery were invented figures in the mock; the
 * real analogue is `dispatched_qty` (what left the yard, the ceiling) and
 * `delivered_qty` (what the outlet actually accepted) -- the same pairing
 * `delivery/entities.go`'s own header describes.
 *
 * # Two known caps, both already established elsewhere
 *
 * `/payments` and `/invoices` have no date-range filter server-side
 * (`internal/repository/payment` and `invoice`'s own list definitions --
 * see `financeApi.http.ts`'s own header for the same limitation on the
 * aging report), so both are fetched once at `MaxPageSize` (100, newest
 * first) and the date window is applied client-side, same as
 * `getAgingReport()` already does. At real data volumes beyond 100 rows in
 * a period this undercounts revenue and receivables -- the plan's own
 * B-Step 5 names this exact trigger for a dedicated backend aggregation
 * endpoint (`GetTrialBalance`-style), not assumed away here.
 *
 * `/deliveries` itself has no such cap for the count that matters:
 * `suratJalan`'s underlying page also stops at 100 rows for a range with
 * more surat jalan than that, which understates every per-status count and
 * the daily series alike. Same trigger, same fix, once real volumes justify
 * it.
 */
import { getList, getOne } from "@/lib/api";
import { getOutletList } from "@/features/outlet/api/outletApi";
import { getVehicles } from "@/features/vehicles/api/vehicleApi";
import { getSettings } from "@/features/settings/api/settingsApi";
import type { OutletView } from "@/features/outlet/api/contract";
import { exportCsv, printDocument, timestampSuffix } from "@/lib/export";
import { addDays, isoDate } from "@/lib/date";
import { outletLabelTitle, unitLabel, unitLabelTitle } from "@/lib/lexicon";
import {
  RANGE_LABEL,
  resolveRange,
  type DailyPoint,
  type DriverPerformanceRow,
  type ReportRange,
  type ReportSummary,
  type ReportsApi,
  type TopOutletRow,
} from "./contract";

/** 100 is every list definition's MaxPageSize; the server refuses more. */
const PAGE_SIZE = 100;

/** Mirrors the fields of delivery's own DeliveryResponse this adapter needs. */
interface DeliveryResponse {
  outlet_id?: string;
  driver_id?: string;
  driver_name?: string;
  vehicle_id?: string;
  plate?: string;
  dispatched_qty: number;
  delivered_qty: number;
  delivery_status: string;
  created_at: string;
}

/** Mirrors the fields of finance's own PaymentResponse this adapter needs. */
interface PaymentResponse {
  outlet_id: string;
  amount: number;
  payment_date: string;
  payment_status: string;
}

/** Mirrors the fields of finance's own InvoiceResponse this adapter needs. */
interface InvoiceResponse {
  outlet_id: string;
  total_amount: number;
  outstanding_amount: number;
  issued_at: string;
}

const SELESAI_STATUSES = new Set(["delivered"]);
const TERTUNDA_STATUSES = new Set(["pending", "on_route"]);

function inWindow(iso: string, window: { from: string; to: string }): boolean {
  const day = iso.slice(0, 10);
  return day >= window.from && day <= window.to;
}

async function outletsById(): Promise<Map<string, OutletView>> {
  const outlets = await getOutletList();
  return new Map(outlets.map((o) => [o.id, o]));
}

/**
 * `window.to` is inclusive, but the server's `date` filter compares `lte`
 * literally against midnight UTC of that day -- against `created_at`, a
 * timestamp, that excludes almost all of `window.to` itself (verified live:
 * a delivery at 16:52 UTC matched `gte` its own day but not `lte` it). The
 * exclusive `lt` bound one day later is the only one that reads "through the
 * end of `window.to`" correctly.
 */
async function fetchDeliveries(window: { from: string; to: string }): Promise<DeliveryResponse[]> {
  const exclusiveEnd = isoDate(addDays(new Date(`${window.to}T00:00:00Z`), 1));
  const page = await getList<DeliveryResponse>("/deliveries", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "created_at", direction: "desc" }],
    filters: [
      { field: "date", operator: "gte" as const, value: window.from },
      { field: "date", operator: "lt" as const, value: exclusiveEnd },
    ],
  });
  return page.items;
}

/** No date filter server-side -- see this file's header. */
async function fetchPayments(): Promise<PaymentResponse[]> {
  const page = await getList<PaymentResponse>("/payments", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "payment_date", direction: "desc" }],
  });
  return page.items;
}

/** Mirrors the SIM3LON usecase's OpeningRevenueResponse. */
interface OpeningRevenueResponse {
  days: Array<{ date: string; qty: number; total: number }>;
  qty: number;
  total: number;
}

/**
 * Pre-go-live SIM3LON revenue, already aggregated per day server-side from
 * the same rows the ledger journals were posted from -- so, unlike payments,
 * it has no page cap to work around.
 */
async function fetchOpeningRevenue(window: { from: string; to: string }): Promise<OpeningRevenueResponse> {
  const params = new URLSearchParams({ from: window.from, to: window.to });
  return getOne<OpeningRevenueResponse>(`/sim3lon-opening-revenue?${params.toString()}`);
}

/** No date filter server-side -- see this file's header. */
async function fetchInvoices(): Promise<InvoiceResponse[]> {
  const page = await getList<InvoiceResponse>("/invoices", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "issued_at", direction: "desc" }],
  });
  return page.items;
}

async function getReportSummary(range: ReportRange): Promise<ReportSummary> {
  const window = resolveRange(range);
  const [deliveries, payments, invoices, opening] = await Promise.all([
    fetchDeliveries(window),
    fetchPayments(),
    fetchInvoices(),
    fetchOpeningRevenue(window),
  ]);

  const paymentsInWindow = payments.filter((p) => inWindow(p.payment_date, window));
  const invoicesInWindow = invoices.filter((i) => inWindow(i.issued_at, window));

  const realisasi = deliveries.reduce((s, d) => s + d.delivered_qty, 0);
  const target = deliveries.reduce((s, d) => s + d.dispatched_qty, 0);
  const days = Math.max(
    1,
    Math.round(
      (new Date(window.to).getTime() - new Date(window.from).getTime()) / 86_400_000,
    ) + 1,
  );

  return {
    range: window,
    unitTerkirim: realisasi,
    unitTarget: target,
    pencapaian: target === 0 ? 0 : (realisasi / target) * 100,
    pendapatan: paymentsInWindow
      .filter((p) => p.payment_status === "verified")
      .reduce((s, p) => s + p.amount, 0),
    pendapatanSebelumGoLive: opening.total,
    unitSebelumGoLive: opening.qty,
    piutang: invoicesInWindow.reduce((s, i) => s + i.outstanding_amount, 0),
    ditolak: paymentsInWindow
      .filter((p) => p.payment_status === "rejected")
      .reduce((s, p) => s + p.amount, 0),
    suratJalan: deliveries.length,
    suratJalanSelesai: deliveries.filter((d) => SELESAI_STATUSES.has(d.delivery_status)).length,
    suratJalanTertunda: deliveries.filter((d) => TERTUNDA_STATUSES.has(d.delivery_status)).length,
    outletDilayani: new Set(deliveries.map((d) => d.outlet_id).filter(Boolean)).size,
    rerataPerHari: Math.round(realisasi / days),
  };
}

async function getDailySeries(range: ReportRange): Promise<DailyPoint[]> {
  const window = resolveRange(range);
  const [deliveries, payments, opening] = await Promise.all([
    fetchDeliveries(window), fetchPayments(), fetchOpeningRevenue(window),
  ]);
  const points = new Map<string, DailyPoint>();

  for (let d = new Date(window.from); isoDate(d) <= window.to; d = addDays(d, 1)) {
    points.set(isoDate(d), {
      tanggal: isoDate(d), target: 0, realisasi: 0, pendapatan: 0, pendapatanSebelumGoLive: 0,
    });
  }

  for (const row of deliveries) {
    const point = points.get(row.created_at.slice(0, 10));
    if (!point) continue;
    point.target += row.dispatched_qty;
    point.realisasi += row.delivered_qty;
  }
  for (const p of payments) {
    if (p.payment_status !== "verified") continue;
    const point = points.get(p.payment_date.slice(0, 10));
    if (point) point.pendapatan += p.amount;
  }
  for (const day of opening.days) {
    const point = points.get(day.date);
    if (point) point.pendapatanSebelumGoLive += day.total;
  }

  return [...points.values()];
}

async function getTopOutlet(range: ReportRange, limit = 8): Promise<TopOutletRow[]> {
  const window = resolveRange(range);
  const [deliveries, invoices, outlets] = await Promise.all([
    fetchDeliveries(window),
    fetchInvoices(),
    outletsById(),
  ]);
  const invoicesInWindow = invoices.filter((i) => inWindow(i.issued_at, window));

  // unit is dispatched_qty, not delivered_qty: nilai below comes from the
  // invoice each delivery raises at DISPATCH (see invoice.CreateFromDelivery
  // and delivery.raiseInvoice's own docs on why revenue moved off
  // Complete()), so pairing it with what was actually confirmed received
  // would show a real rupiah figure beside a unit count that stays 0 for
  // every stop nobody has separately filed a driver confirmation for --
  // which by design is most of them now.
  const totals = new Map<string, { unit: number; suratJalan: number; nilai: number }>();
  for (const d of deliveries) {
    if (!d.outlet_id) continue;
    const row = totals.get(d.outlet_id) ?? { unit: 0, suratJalan: 0, nilai: 0 };
    row.unit += d.dispatched_qty;
    row.suratJalan += 1;
    totals.set(d.outlet_id, row);
  }
  // Value comes from invoices actually raised, not units × a global price --
  // matches getTopOutlet's own mock definition and financeApi's own
  // getAgingReport for the same reason.
  for (const inv of invoicesInWindow) {
    const row = totals.get(inv.outlet_id);
    if (row) row.nilai += inv.total_amount;
  }

  return [...totals.entries()]
    .map(([id, v]) => {
      const outlet = outlets.get(id);
      return {
        id,
        nama: outlet?.nama ?? "—",
        kecamatan: outlet?.kecamatan ?? "—",
        unit: v.unit,
        suratJalan: v.suratJalan,
        nilai: v.nilai,
      };
    })
    .sort((a, b) => b.unit - a.unit)
    .slice(0, limit);
}

async function getDriverPerformance(range: ReportRange): Promise<DriverPerformanceRow[]> {
  const window = resolveRange(range);
  const [deliveries, vehicles] = await Promise.all([fetchDeliveries(window), getVehicles()]);
  const vehiclesById = new Map(vehicles.map((v) => [v.id, v]));

  const byDriver = new Map<
    string,
    { nama: string; plat: string; armada: string; rows: DeliveryResponse[] }
  >();
  for (const d of deliveries) {
    if (!d.driver_id) continue;
    const entry =
      byDriver.get(d.driver_id) ??
      {
        nama: d.driver_name ?? "—",
        plat: d.plate ?? "—",
        armada: (d.vehicle_id && vehiclesById.get(d.vehicle_id)?.armada) || "—",
        rows: [],
      };
    entry.rows.push(d);
    byDriver.set(d.driver_id, entry);
  }

  return [...byDriver.entries()]
    .map(([id, { nama, plat, armada, rows }]) => {
      const closed = rows.filter(
        (d) => SELESAI_STATUSES.has(d.delivery_status) || TERTUNDA_STATUSES.has(d.delivery_status),
      );
      return {
        id,
        nama,
        plat,
        armada,
        suratJalan: rows.length,
        selesai: rows.filter((d) => SELESAI_STATUSES.has(d.delivery_status)).length,
        tertunda: rows.filter((d) => TERTUNDA_STATUSES.has(d.delivery_status)).length,
        unit: rows.reduce((s, d) => s + d.delivered_qty, 0),
        ketepatan:
          closed.length === 0
            ? 0
            : (closed.filter((d) => SELESAI_STATUSES.has(d.delivery_status)).length /
                closed.length) *
              100,
      };
    })
    .sort((a, b) => b.unit - a.unit);
}

async function exportReport(range: ReportRange): Promise<number> {
  const series = await getDailySeries(range);
  exportCsv(
    `laporan-${range}-${timestampSuffix()}`,
    ["Tanggal", `Target (${unitLabel()})`, `Realisasi (${unitLabel()})`, "Pendapatan (Rp)",
      "Pendapatan sebelum go-live (Rp)"],
    series.map((p) => [
      new Date(p.tanggal).toLocaleDateString("id-ID"),
      p.target,
      p.realisasi,
      p.pendapatan,
      p.pendapatanSebelumGoLive,
    ]),
  );
  return series.length;
}

/**
 * The printable monthly recap the agency files.
 *
 * `namaPerusahaan`/`nomorAgen` come from `getSettings()`, which reads
 * "—" for both in this build -- `settingsApi`'s own `DEFAULT_SETTINGS`
 * already documents why: neither field is owned by any endpoint yet. The
 * header prints the placeholder rather than inventing a value.
 */
async function printReport(range: ReportRange): Promise<void> {
  const [summary, top, settings] = await Promise.all([
    getReportSummary(range),
    getTopOutlet(range, 10),
    getSettings(),
  ]);
  const fmt = (n: number) => n.toLocaleString("id-ID");
  const rupiah = (n: number) => `Rp ${fmt(n)}`;
  const tanggal = (iso: string) =>
    new Date(iso).toLocaleDateString("id-ID", {
      day: "2-digit",
      month: "long",
      year: "numeric",
    });

  printDocument(
    `Laporan ${RANGE_LABEL[range]}`,
    `
    <p class="eyebrow">${settings.namaPerusahaan} · Agen ${settings.nomorAgen}</p>
    <h1>Rekapitulasi Distribusi &amp; Keuangan</h1>
    <hr class="rule" />
    <div class="meta">
      <div>Periode<strong>${tanggal(summary.range.from)} – ${tanggal(summary.range.to)}</strong></div>
      <div>Surat jalan<strong>${fmt(summary.suratJalan)}</strong></div>
      <div>Outlet dilayani<strong>${fmt(summary.outletDilayani)}</strong></div>
      <div>Dicetak<strong>${new Date().toLocaleString("id-ID")}</strong></div>
    </div>

    <table>
      <thead><tr><th>Ringkasan</th><th style="text-align:right">Nilai</th></tr></thead>
      <tbody>
        <tr><td>${unitLabelTitle()} terkirim</td><td class="num">${fmt(summary.unitTerkirim)}</td></tr>
        <tr><td>Target periode</td><td class="num">${fmt(summary.unitTarget)}</td></tr>
        <tr><td>Pencapaian</td><td class="num">${summary.pencapaian.toFixed(1)}%</td></tr>
        <tr><td>Rata-rata per hari</td><td class="num">${fmt(summary.rerataPerHari)}</td></tr>
        <tr><td>Pendapatan terverifikasi</td><td class="num">${rupiah(summary.pendapatan)}</td></tr>
        <tr><td>Pendapatan sebelum go-live (SIM3LON)</td><td class="num">${rupiah(summary.pendapatanSebelumGoLive)}</td></tr>
        <tr><td>Piutang menunggu verifikasi</td><td class="num">${rupiah(summary.piutang)}</td></tr>
      </tbody>
      <tfoot><tr><td>Surat jalan tertunda</td><td class="num">${fmt(summary.suratJalanTertunda)}</td></tr></tfoot>
    </table>

    <table>
      <thead><tr><th>${outletLabelTitle()}</th><th>Kecamatan</th><th style="text-align:right">Surat jalan</th><th style="text-align:right">${unitLabelTitle()}</th><th style="text-align:right">Nilai</th></tr></thead>
      <tbody>
        ${top
          .map(
            (t) =>
              `<tr><td>${t.nama}</td><td>${t.kecamatan}</td><td class="num">${fmt(t.suratJalan)}</td><td class="num">${fmt(t.unit)}</td><td class="num">${rupiah(t.nilai)}</td></tr>`,
          )
          .join("")}
      </tbody>
    </table>

    <div class="sign">
      <div>Disusun oleh<span></span></div>
      <div>Disetujui oleh<span></span></div>
    </div>`,
  );
}

export const reportApiHttp: ReportsApi = {
  getReportSummary,
  getDailySeries,
  getTopOutlet,
  getDriverPerformance,
  exportReport,
  printReport,
};
