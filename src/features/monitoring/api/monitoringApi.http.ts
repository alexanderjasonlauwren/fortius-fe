/**
 * The dispatcher's board, against the real API.
 *
 * # One request, not three
 *
 * `GET /monitoring/board` returns drivers, stops and totals from one
 * transaction. The console makes exactly one call every 30s and derives
 * everything below from it — three separately-fetched pieces could disagree
 * with each other on the one screen whose whole job is reconciling the day.
 *
 * # Grouping happened on the server
 *
 * A delivery is one product at one outlet; a stop is one visit. The server
 * already groups per (trip, sequence_no) the same way `MyRunResponse` groups a
 * driver's own run, so `stops[]` here is already one row per visit — this
 * adapter does not re-derive that.
 *
 * # What this adapter cannot honestly derive
 *
 * `eta` needs a route engine that does not exist: left `undefined`, and the
 * card hides the line rather than printing a guess. `jamRencana` is `""` for
 * the same reason `sopirApi.http.ts` sets it — the plan carries a stop's
 * *position*, not a clock time; `urutan` (from `sequence_no`) is what actually
 * orders a round now, and `lib/roundSequence.ts` / `MonitoringTable` sort by
 * it rather than by the empty string. `durasi` is not invented the way the
 * mock's "±15 menit" is — it is computed from the real arrival timestamp, so
 * it is a measurement rather than a placeholder wherever a truck is actually
 * standing at a gate.
 *
 * The `"kasar"` verdict is reachable: the board carries `filed_accuracy_m`,
 * the device's own stated error on the filing, and it is mapped onto the
 * `GeoStamp`'s `akurasi` below. Without it a driver who filed on a ±2 km
 * cell-tower fix read as `"jauh"` — an accusation `src/lib/geo.ts` says
 * plainly the data cannot support. A device that states no accuracy still
 * yields no `akurasi`, and that case still cannot be distinguished; the
 * difference is that it is now the exception rather than every filing.
 *
 * # The desk files no position
 *
 * A dispatcher's write never carries `latitude`/`longitude`. An office is not
 * where a drop happened, and filing it as one would poison the very
 * corroboration this board renders for everybody else's filings.
 */
import { getOne, send } from "@/lib/api";
import { geoVerdict } from "@/lib/geo";
import { getSettings } from "@/features/settings/api/settingsApi";
import { printDocument } from "@/lib/export";
import type {
  DateRange,
  MonitoringApi,
  SetDeliveryStatusInput,
  StatusReceipt,
} from "./contract";
import type {
  DriverCard,
  DriverStatus,
  MonitoringAssignment,
  MonitoringRow,
  MonitoringSnapshot,
} from "../types";

/** Mirrors the backend's BoardDelivery. */
interface BoardDeliveryWire {
  id: string;
  delivery_number: string;
  product_id: string;
  product_name: string;
  dispatched_qty: number;
  delivered_qty: number;
  returned_qty: number;
  empties_collected: number;
  delivery_status: string;
  version: number;
}

/** Mirrors the backend's BoardStop. */
interface BoardStopWire {
  stop_id: string;
  trip_id: string;
  sequence_no: number;
  driver_id: string;
  outlet_id: string;
  outlet_code: string;
  outlet_name: string;
  outlet_owner: string;
  outlet_address?: string;
  outlet_district?: string;
  latitude?: number;
  longitude?: number;
  dispatched_qty: number;
  delivered_qty: number;
  returned_qty: number;
  stop_status: string;
  departed_at?: string;
  arrived_at?: string;
  completed_at?: string;
  failure_reason?: string;
  notes?: string;
  filed_at?: string;
  filed_distance_m?: number;
  filed_accuracy_m?: number;
  deliveries: BoardDeliveryWire[];
}

/** Mirrors the backend's BoardDriver. */
interface BoardDriverWire {
  driver_id: string;
  driver_name: string;
  employment_status: string;
  vehicle_id?: string;
  plate?: string;
  vehicle_type?: string;
  capacity_qty?: number;
  trip_id?: string;
  trip_status?: string;
  departed_at?: string;
  returned_at?: string;
  latitude?: number;
  longitude?: number;
  position_at?: string;
  depot_name?: string;
  depot_latitude?: number;
  depot_longitude?: number;
  loaded_qty: number;
  stops_total: number;
  stops_done: number;
}

/** Mirrors the backend's BoardResponse. */
interface BoardResponseWire {
  date_from: string;
  date_to: string;
  generated_at: string;
  geofence_radius_m?: number;
  drivers: BoardDriverWire[];
  stops: BoardStopWire[];
  totals: {
    target: number;
    realisasi: number;
    selesai: number;
    proses: number;
    antrian: number;
    tertunda: number;
  };
}

/**
 * Used when no ancestor has ever set a geofence radius, and when a driver's
 * truck has been reported nowhere and there is no depot on record to fan
 * parked pins around either. Not a claim about where anything actually is —
 * a drawing fallback so the map has somewhere to put a pin.
 */
const FALLBACK_RADIUS_M = 150;
const FALLBACK_COORD = { lat: -7.3305, lng: 110.5084 };

/**
 * What each stop was built from, keyed by the stop id the screen holds.
 *
 * Populated by every `getMonitoringSnapshot`, which always runs before a
 * write is possible — there is nothing to press until a board has been
 * drawn. A miss is a bug, not a stale cache, so it throws instead of
 * guessing: filing against the wrong surat jalan is worse than not filing.
 */
const stopIndex = new Map<string, BoardDeliveryWire[]>();
/** The full stop, kept alongside `stopIndex` for printing. */
const stopCache = new Map<string, BoardStopWire>();
/** The date the board was last read for — the only date printing has. */
let boardDate = "";

function documentsFor(stopId: string): BoardDeliveryWire[] {
  const found = stopIndex.get(stopId);
  if (!found?.length) {
    throw new Error("Baris ini belum dimuat. Muat ulang papan monitoring.");
  }
  return found;
}

/** A document is still open if nothing has settled it. */
function isOpen(doc: BoardDeliveryWire): boolean {
  return (
    doc.delivery_status !== "delivered" &&
    doc.delivery_status !== "partial" &&
    doc.delivery_status !== "failed"
  );
}

/**
 * A document that has not yet been sent out.
 *
 * Separate from `isOpen`: a half-departed stop has some documents already
 * `on_route`, which is still "open" for completing or failing but must not
 * be re-departed — `POST /deliveries/:id/depart` refuses a second departure
 * with a 409, and re-sending it would take the rest of the fan-out down.
 */
function notYetDeparted(doc: BoardDeliveryWire): boolean {
  return doc.delivery_status === "pending";
}

function toRowStatus(stopStatus: string): MonitoringRow["status"] {
  switch (stopStatus) {
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

function toRow(stop: BoardStopWire, driverName: string, radiusM: number): MonitoringRow {
  return {
    id: stop.stop_id,
    // Every document the outlet signs for, because a stop may cover more
    // than one and the driver hands over all of them.
    kode: stop.deliveries.map((d) => d.delivery_number).join(", "),
    suratJalan: stop.deliveries.map((d) => ({ id: d.id, kode: d.delivery_number })),
    outletId: stop.outlet_id,
    outlet: stop.outlet_name,
    alamat: stop.outlet_district ? `Kec. ${stop.outlet_district}` : "—",
    driverId: stop.driver_id,
    driver: driverName,
    jamRencana: "",
    urutan: stop.sequence_no,
    target: stop.dispatched_qty,
    realisasi: stop.delivered_qty,
    pencapaianPersen:
      stop.dispatched_qty === 0 ? 0 : (stop.delivered_qty / stop.dispatched_qty) * 100,
    status: toRowStatus(stop.stop_status),
    coord: {
      lat: stop.latitude ?? FALLBACK_COORD.lat,
      lng: stop.longitude ?? FALLBACK_COORD.lng,
    },
    lokasi: stop.filed_at
      ? {
          verdict: geoVerdict(
            { status: "ok", at: stop.filed_at, akurasi: stop.filed_accuracy_m },
            stop.filed_distance_m,
            radiusM,
          ),
          jarakMeter: stop.filed_distance_m,
        }
      : undefined,
    catatan: stop.failure_reason ?? stop.notes,
    version: stop.deliveries[0]?.version ?? 0,
  };
}

/** The stage a driver's fleet card shows. */
function toDriverStatus(driver: BoardDriverWire, mine: BoardStopWire[]): DriverStatus {
  if (driver.employment_status === "on_leave") return "Cuti";
  if (mine.length > 0 && mine.every((s) => s.stop_status === "delivered" || s.stop_status === "partial")) {
    return "Selesai";
  }
  if (mine.some((s) => s.stop_status === "on_route" && s.arrived_at)) return "Bongkar Muat";
  if (driver.departed_at) return "Dalam Perjalanan";
  return "Standby";
}

/** "±N menit" from a real arrival, not the mock's fixed guess. */
function minutesSince(iso: string): string {
  const minutes = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 60_000));
  return `±${minutes} menit`;
}

function toDriverCard(driver: BoardDriverWire, mine: BoardStopWire[], slot: number): DriverCard {
  const status = toDriverStatus(driver, mine);
  const sorted = [...mine].sort((a, b) => a.sequence_no - b.sequence_no);
  const target =
    sorted.find((s) => s.stop_status === "on_route") ??
    sorted.find((s) => s.stop_status === "pending");
  const atGate =
    status === "Bongkar Muat"
      ? sorted.find((s) => s.stop_status === "on_route" && s.arrived_at)
      : undefined;

  return {
    id: driver.driver_id,
    name: driver.driver_name,
    slot,
    plat: driver.plate ?? "—",
    armada: driver.vehicle_type ?? "—",
    kapasitas: driver.capacity_qty ?? 0,
    status,
    muatan: driver.loaded_qty,
    tujuanOutlet: target?.outlet_name,
    // No route engine exists to compute one.
    eta: undefined,
    lokasi: target?.outlet_district ?? driver.depot_name,
    durasi: atGate ? minutesSince(atGate.arrived_at!) : undefined,
    selesai: driver.stops_done,
    total: driver.stops_total,
  };
}

function toAssignment(
  driver: BoardDriverWire,
  mine: BoardStopWire[],
  index: number,
  totalDrivers: number,
): MonitoringAssignment | null {
  if (mine.length === 0) return null;

  const sorted = [...mine].sort((a, b) => a.sequence_no - b.sequence_no);
  const remaining = sorted.filter(
    (s) => s.stop_status !== "delivered" && s.stop_status !== "partial",
  );
  const lastDone = [...sorted]
    .reverse()
    .find((s) => s.stop_status === "delivered" || s.stop_status === "partial");
  const coordOf = (s: BoardStopWire) => ({
    lat: s.latitude ?? FALLBACK_COORD.lat,
    lng: s.longitude ?? FALLBACK_COORD.lng,
  });

  // Trucks with no fix and nothing driven yet fan around the depot, so their
  // pins do not stack into one unreadable marker — the same trick the mock
  // does, from whichever depot the run's own branch resolves to.
  const depotLat = driver.depot_latitude ?? FALLBACK_COORD.lat;
  const depotLng = driver.depot_longitude ?? FALLBACK_COORD.lng;
  const angle = (index / Math.max(1, totalDrivers)) * Math.PI * 2;
  const parked = {
    lat: depotLat + Math.sin(angle) * 0.006,
    lng: depotLng + Math.cos(angle) * 0.006,
  };

  const driverCoord =
    driver.latitude != null && driver.longitude != null
      ? { lat: driver.latitude, lng: driver.longitude }
      : lastDone && remaining.length === 0
        ? coordOf(lastDone)
        : parked;

  const target = remaining[0] ?? sorted[sorted.length - 1];

  return {
    id: driver.driver_id,
    driverId: driver.driver_id,
    outletId: target.outlet_id,
    driverCoord,
    stops: (remaining.length > 0 ? remaining : sorted).map(coordOf),
    berjalan: !!driver.departed_at,
    selesai: remaining.length === 0,
  };
}

async function getMonitoringSnapshot(dateRange: DateRange): Promise<MonitoringSnapshot> {
  const query =
    `?date_from=${encodeURIComponent(dateRange.from)}` +
    `&date_to=${encodeURIComponent(dateRange.to)}`;
  const board = await getOne<BoardResponseWire>(`/monitoring/board${query}`);

  stopIndex.clear();
  stopCache.clear();
  boardDate = board.date_from;
  board.stops.forEach((stop) => {
    stopIndex.set(stop.stop_id, stop.deliveries);
    stopCache.set(stop.stop_id, stop);
  });

  const driverNameOf = new Map(board.drivers.map((d) => [d.driver_id, d.driver_name]));
  const radiusM = board.geofence_radius_m ?? FALLBACK_RADIUS_M;
  const rows = board.stops.map((stop) => toRow(stop, driverNameOf.get(stop.driver_id) ?? "—", radiusM));

  const stopsByDriver = new Map<string, BoardStopWire[]>();
  board.stops.forEach((stop) => {
    const list = stopsByDriver.get(stop.driver_id) ?? [];
    list.push(stop);
    stopsByDriver.set(stop.driver_id, list);
  });

  const drivers = board.drivers.map((driver, i) =>
    toDriverCard(driver, stopsByDriver.get(driver.driver_id) ?? [], i),
  );

  const assignments = board.drivers
    .map((driver, i) =>
      toAssignment(driver, stopsByDriver.get(driver.driver_id) ?? [], i, board.drivers.length),
    )
    .filter((a): a is MonitoringAssignment => a !== null);

  return {
    drivers,
    rows,
    // The server's clock, not the browser's — a "last sync" read off a
    // laptop with a wrong clock is worse than none.
    lastSyncAt: board.generated_at,
    assignments,
    // Read straight from the server rather than recomputed: the moment this
    // adapter derived a status differently than the board did, the summary
    // would contradict the rows on the one screen whose job is reconciling
    // them.
    totals: board.totals,
  };
}

async function getDriverCards(dateRange: DateRange) {
  return (await getMonitoringSnapshot(dateRange)).drivers;
}

async function getMonitoringTable(dateRange: DateRange) {
  return (await getMonitoringSnapshot(dateRange)).rows;
}

function receipt(
  docs: BoardDeliveryWire[],
  status: MonitoringRow["status"],
  realisasi: number,
): StatusReceipt {
  return { kode: docs.map((d) => d.delivery_number).join(", "), status, realisasi };
}

/**
 * Records what actually happened at a stop, fanned out one call per document.
 *
 * "Antrian" is not handled here — the contract does not offer it, because
 * nothing can un-depart a truck.
 */
async function setDeliveryStatus(input: SetDeliveryStatusInput): Promise<StatusReceipt> {
  const docs = documentsFor(input.deliveryId);

  if (input.status === "Proses") {
    for (const doc of docs.filter((d) => notYetDeparted(d))) {
      await send("post", `/deliveries/${doc.id}/depart`, { version: doc.version });
    }
    return receipt(docs, "Proses", 0);
  }

  if (input.status === "Tertunda") {
    const reason = input.catatan?.trim();
    if (!reason) {
      // The service refuses a failure nobody explained
      // (ck_deliveries_failure_reason); refusing here saves a round trip to
      // learn the same thing.
      throw new Error("Alasan kendala wajib diisi.");
    }
    for (const doc of docs.filter((d) => isOpen(d))) {
      await send("post", `/deliveries/${doc.id}/fail`, {
        version: doc.version,
        failure_reason: reason,
      });
    }
    return receipt(docs, "Tertunda", 0);
  }

  // "Selesai": the dialog collects one realisasi figure for the whole stop.
  // Split it across the stop's open documents in dispatch order — a document
  // not explicitly topped up closes at what it carried, and the shortfall is
  // filed as a return rather than as nothing, the same computation
  // `sopirApi.http.ts` makes for the driver's own completion.
  const openDocs = docs.filter((d) => isOpen(d));
  let left = input.realisasi ?? openDocs.reduce((sum, d) => sum + d.dispatched_qty, 0);
  let filed = 0;
  for (const doc of openDocs) {
    const delivered = Math.max(0, Math.min(doc.dispatched_qty, left));
    left -= delivered;
    filed += delivered;
    await send("post", `/deliveries/${doc.id}/complete`, {
      version: doc.version,
      delivered_qty: delivered,
      returned_qty: doc.dispatched_qty - delivered,
      empties_collected: 0,
    });
  }
  return receipt(docs, "Selesai", filed);
}

/**
 * Prints the surat jalan a stop carries, from the board's own data plus the
 * agency's letterhead. No second request for the outlet or the driver: the
 * board already has everything except the company name and registration
 * number, which come from `features/settings`.
 */
async function printSuratJalan(rowId: string): Promise<void> {
  const stop = stopCache.get(rowId);
  if (!stop) {
    throw new Error("Baris ini belum dimuat. Muat ulang papan monitoring.");
  }
  const settings = await getSettings();
  const fmt = (n: number) => n.toLocaleString("id-ID");
  const kode = stop.deliveries.map((d) => d.delivery_number).join(", ");
  const target = stop.deliveries.reduce((s, d) => s + d.dispatched_qty, 0);
  const realisasi = stop.deliveries.reduce((s, d) => s + d.delivered_qty, 0);
  const tanggal = boardDate
    ? new Date(boardDate).toLocaleDateString("id-ID", {
        day: "2-digit",
        month: "long",
        year: "numeric",
      })
    : "—";

  printDocument(
    `${kode} — Surat Jalan`,
    `
    <p class="eyebrow">${settings.namaPerusahaan} · Agen ${settings.nomorAgen}</p>
    <h1>Surat Jalan</h1>
    <hr class="rule" />
    <div class="meta">
      <div>Nomor<strong class="code">${kode}</strong></div>
      <div>Tanggal<strong>${tanggal}</strong></div>
      <div>Status<strong>${toRowStatus(stop.stop_status)}</strong></div>
    </div>
    <table>
      <thead><tr><th>Tujuan</th><th style="text-align:right">Target</th><th style="text-align:right">Realisasi</th></tr></thead>
      <tbody>
        <tr>
          <td><strong>${stop.outlet_name}</strong><br />${stop.outlet_address ?? ""}${
            stop.outlet_district ? `, Kec. ${stop.outlet_district}` : ""
          }<br />${stop.outlet_owner}</td>
          <td class="num">${fmt(target)}</td>
          <td class="num">${fmt(realisasi)}</td>
        </tr>
      </tbody>
    </table>
    ${
      stop.failure_reason || stop.notes
        ? `<p style="margin-top:12px"><strong>Catatan:</strong> ${stop.failure_reason ?? stop.notes}</p>`
        : ""
    }
    <div class="sign">
      <div>Pengirim<span></span></div>
      <div>Penerima<span>${stop.outlet_owner}</span></div>
    </div>`,
  );
}

export const monitoringApiHttp: MonitoringApi = {
  getMonitoringSnapshot,
  getDriverCards,
  getMonitoringTable,
  setDeliveryStatus,
  printSuratJalan,
};
