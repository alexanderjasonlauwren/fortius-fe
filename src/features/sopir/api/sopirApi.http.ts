/**
 * The driver's day, against the real API.
 *
 * # One visit, several documents
 *
 * The service issues one surat jalan per product: a pangkalan taking 3 kg and
 * 12 kg in one drop has two. The driver still parks once, so `GET
 * /deliveries/mine` returns them already grouped into stops — the grouping
 * lives on the server so a second client cannot group differently.
 *
 * That leaves this adapter with the write side of the same fact. A stop the
 * driver closes once fans out into one call per document, because that is
 * where the accountability sits: a refusal, a shortfall and an invoice are all
 * per product. `stopIndex` remembers which documents a stop was built from, so
 * the fan-out uses ids the server gave us rather than ids assembled here.
 *
 * # Position
 *
 * Every filing carries the phone's fix when there is one. The read happens
 * before the request, so a slow GPS delays the submission rather than losing
 * it.
 */
import { downscaleImage } from "@/lib/image";
import { getOne, send } from "@/lib/api";
import {
  DEFAULT_GEOFENCE_RADIUS_M,
  capturePosition,
  distanceMeters,
  geoVerdict,
  type GeoStamp,
} from "@/lib/geo";
import { unitLabel } from "@/lib/lexicon";
import type { CompleteStopInput, GpsFixInput, SopirApi, StopReceipt } from "./contract";
import {
  buildRequest,
  indexedDbOutbox,
  isOffline,
  memoryOutbox,
  nextSeq,
  replay,
  type Filing,
  type FilingKind,
  type OutboxStore,
  type ReplayResult,
  type Transport,
  type Versions,
} from "../lib/outbox";
import type { DriverRun, RunStop, StopLine } from "../types";

/** Mirrors the backend's DeliveryResponse. */
interface DeliveryResponse {
  id: string;
  delivery_number: string;
  product_id?: string;
  product_name?: string;
  /** commodity | accessory | container. A commodity drop is an exchange. */
  product_kind?: string;
  dispatched_qty: number;
  delivered_qty: number;
  returned_qty: number;
  empties_collected: number;
  departed_at?: string;
  arrived_at?: string;
  completed_at?: string;
  delivery_status: string;
  failure_reason?: string;
  notes?: string;
  /** Who took the load, from the newest recipient proof. Run endpoint only. */
  recipient_name?: string;
  version: number;
}

/** Mirrors the backend's RunStopResponse. */
interface StopResponse {
  sequence_no: number;
  outlet_id?: string;
  outlet_code?: string;
  outlet_name?: string;
  owner_name?: string;
  phone?: string;
  address?: string;
  district?: string;
  latitude?: number;
  longitude?: number;
  /** Which of the driver's loads today; positions restart on every run. */
  trip_no?: number;
  deliveries: DeliveryResponse[];
}

/** Mirrors the backend's MyRunResponse. */
interface RunResponse {
  date: string;
  driver_id?: string;
  driver_name?: string;
  vehicle_id?: string;
  plate?: string;
  /** The truck's, carried on the run: the driver's role cannot read /vehicles. */
  vehicle_type?: string;
  capacity_qty?: number;
  kernet_name?: string;
  /** The session's seat: "driver" or "kernet". Absent on an empty run. */
  crew_role?: string;
  stops: StopResponse[];
  // The agency's own switch, resolved server-side because this account has
  // no permission to read tenant settings directly.
  record_driver_location: boolean;
  /** How close to a pangkalan counts as there. Absent when nobody set it. */
  geofence_radius_m?: number;
}

const VEHICLE_LABEL: Record<string, string> = {
  truck: "Truk",
  pickup: "Pikap",
  van: "Van",
};

/**
 * What each stop was built from, keyed by the stop id the screen holds.
 *
 * Populated by every `getMyRun`, which the screen always runs before it can
 * offer a button — there is nothing to press until a run has been drawn. A
 * miss is therefore a bug rather than a stale cache, and it throws instead of
 * guessing: filing against the wrong surat jalan is worse than not filing.
 */
const stopIndex = new Map<string, DeliveryResponse[]>();

/** Where each stop's pangkalan is, for the location check on arrival. */
const stopPlace = new Map<string, { lat: number; lng: number } | null>();
let runRadius = DEFAULT_GEOFENCE_RADIUS_M;

/**
 * A document is still open if nothing has settled it.
 *
 * A stop can be half closed — one product filed, the other not — whenever a
 * fan-out stopped part way. Filing against the settled half answers "this drop
 * is already partial and cannot be filed against again" and takes the rest of
 * the stop down with it, leaving the driver with a button that can never work.
 */
function isOpen(row: DeliveryResponse): boolean {
  return !row.completed_at && row.delivery_status !== "failed";
}

function documentsFor(stopId: string): DeliveryResponse[] {
  const found = stopIndex.get(stopId);
  if (!found?.length) {
    throw new Error(
      "Surat jalan untuk perhentian ini belum dimuat. Muat ulang rute Anda.",
    );
  }
  return found;
}

/**
 * The stage the driver's card shows.
 *
 * Read off the timestamps rather than `delivery_status`, because they answer
 * the question the card asks. `partial` is a settled drop the outlet took some
 * of — from the driver's side that is done, and the shortfall is already in
 * the numbers under it.
 */
function toStage(rows: DeliveryResponse[]): RunStop["status"] {
  if (rows.some((r) => r.delivery_status === "failed")) return "Tertunda";
  if (rows.every((r) => r.completed_at)) return "Selesai";
  if (rows.some((r) => r.departed_at)) return "Proses";
  return "Antrian";
}

function toLine(row: DeliveryResponse): StopLine {
  return {
    productId: row.product_id ?? "",
    nama: row.product_name ?? "Produk tidak dikenal",
    // The service does not carry a per-product unit. The console's configured
    // unit is the honest stand-in.
    satuan: unitLabel(),
    // A refill is handed over for an empty, so a commodity drop asks how many
    // empties came back; an accessory (a scale, a sign) never does. Read off
    // the product rather than off empties already filed: before, the field
    // only appeared once something had been filed, so it could never be
    // filled in.
    returnable: row.product_kind === "commodity" || row.empties_collected > 0,
    target: row.dispatched_qty,
    realisasi: row.delivered_qty,
    kembali: row.returned_qty || undefined,
  };
}

function toStop(stop: StopResponse, urutan: number): RunStop {
  const rows = stop.deliveries;
  // The first document's id names the stop. A real id, not a synthetic key:
  // it survives a reload and it is one the server would recognise.
  const id = rows[0]?.id ?? `stop-${stop.sequence_no}`;
  stopIndex.set(id, rows);
  // The server's version is the truth for whatever has been applied; a
  // filing still in the outbox has not been, and is built on this.
  for (const row of rows) versions.set(row.id, row.version);

  const sum = (pick: (r: DeliveryResponse) => number) =>
    rows.reduce((total, r) => total + pick(r), 0);
  const empties = sum((r) => r.empties_collected);
  // Full cylinders coming back on the truck: refused at a short drop, or the
  // whole load of a stop that could not be made.
  const fullBack = sum((r) => r.returned_qty);
  stopPlace.set(
    id,
    stop.latitude != null && stop.longitude != null
      ? { lat: stop.latitude, lng: stop.longitude }
      : null,
  );
  // The stop's documents are closed from one conversation at one gate, so the
  // first name filed is the stop's. `notes` is the driver's free text and is
  // not a fallback for it — a note is not a signature.
  const recipient = rows.find((r) => r.recipient_name)?.recipient_name;

  return {
    id,
    // Every document the outlet signs for, because there may be more than one
    // and the driver hands over all of them.
    kode: rows.map((r) => r.delivery_number).join(", "),
    urutan,
    rit: stop.trip_no,
    outletId: stop.outlet_id ?? "",
    outlet: stop.outlet_name ?? "—",
    alamat: stop.address ?? "—",
    kecamatan: stop.district ?? "—",
    telepon: stop.phone ?? "",
    penanggungJawab: stop.owner_name ?? "",
    lat: stop.latitude ?? 0,
    lng: stop.longitude ?? 0,
    // The plan carries no clock time per stop, only a position in the run.
    jamRencana: "",
    lines: rows.map(toLine),
    target: sum((r) => r.dispatched_qty),
    realisasi: sum((r) => r.delivered_qty),
    unitKembali: empties || undefined,
    isiKembali: fullBack || undefined,
    diterimaOleh: recipient,
    status: toStage(rows),
    // The earliest arrival on the stop: the driver reached the gate once, and
    // the documents are closed one after another from that same visit.
    tibaPada: rows
      .map((r) => r.arrived_at)
      .filter((at): at is string => !!at)
      .sort()[0],
    catatan: rows.find((r) => r.failure_reason)?.failure_reason ?? rows.find((r) => r.notes)?.notes,
    selesaiPada: rows.find((r) => r.completed_at)?.completed_at,
    // Filings come from each document's own event log, which is a request per
    // stop. The card renders without them, so they are not fetched here.
    filings: [],
  };
}

async function getMyRun(_driverId: string, tanggal?: string): Promise<DriverRun> {
  const query = tanggal ? `?date=${encodeURIComponent(tanggal)}` : "";
  const run = await getOne<RunResponse>(`/deliveries/mine${query}`);

  stopIndex.clear();
  const stops = run.stops.map((s, i) => toStop(s, i + 1));

  // On the run itself: the driver's role has no fleet permission, and asking
  // /vehicles answered 403 on every load, leaving "—" in the header all day.
  const armada = run.vehicle_type ? (VEHICLE_LABEL[run.vehicle_type] ?? run.vehicle_type) : "—";
  const kapasitas = run.capacity_qty ?? 0;
  runRadius = run.geofence_radius_m ?? DEFAULT_GEOFENCE_RADIUS_M;

  const open = stops.filter((s) => s.status !== "Selesai" && s.status !== "Tertunda");

  return {
    // From the run, not assumed -- the driver's own account cannot read
    // tenant settings, so the server resolves this and hands it back.
    rekamLokasi: run.record_driver_location,
    peran: run.crew_role === "kernet" ? "Kernet" : "Sopir",
    kernet: run.kernet_name,
    driver: run.driver_id
      ? {
          id: run.driver_id,
          nama: run.driver_name ?? "—",
          plat: run.plate ?? "—",
          armada,
          kapasitas,
          status: open.length ? "Bertugas" : "Standby",
        }
      : null,
    tanggal: run.date,
    radiusMeter: runRadius,
    stops,
    totals: {
      singgah: stops.length,
      selesai: stops.filter((s) => s.status === "Selesai").length,
      tertunda: stops.filter((s) => s.status === "Tertunda").length,
      sisa: open.length,
      muatan: stops.reduce((t, s) => t + s.target, 0),
      terkirim: stops.reduce((t, s) => t + s.realisasi, 0),
      kosong: stops.reduce((t, s) => t + (s.unitKembali ?? 0), 0),
      isiKembali: stops.reduce((t, s) => t + (s.isiKembali ?? 0), 0),
      kapasitas,
    },
    // A drop already under way outranks the next queued one.
    stopBerikutId:
      stops.find((s) => s.status === "Proses")?.id ??
      stops.find((s) => s.status === "Antrian")?.id ??
      null,
  };
}

/** A filed position, or nothing at all — a phone with no fix must still file. */
type Fix =
  | { latitude: number; longitude: number; accuracy_m?: number }
  | Record<string, never>;

/**
 * The phone's fix, read before the write so a slow GPS delays rather than loses.
 *
 * The accuracy goes with it: without it the office cannot tell "180 m from the
 * gate" from "180 m from the gate on a fix good to two kilometres".
 */
async function position(): Promise<{ fields: Fix; stamp: GeoStamp }> {
  const stamp = await capturePosition({ aktif: true });
  const fields: Fix =
    stamp.lat != null && stamp.lng != null
      ? {
          latitude: stamp.lat,
          longitude: stamp.lng,
          ...(stamp.akurasi != null ? { accuracy_m: Math.round(stamp.akurasi) } : {}),
        }
      : {};
  return { fields, stamp };
}

/**
 * How a fix compares with the stop's pangkalan.
 *
 * A warning for the driver, never a refusal: GPS is wrong often enough that a
 * drop must always be recordable, and the office sees the same verdict.
 */
function lokasiFor(stopId: string, stamp: GeoStamp): StopReceipt["lokasi"] {
  const place = stopPlace.get(stopId);
  const jarakMeter =
    place && stamp.lat != null && stamp.lng != null
      ? distanceMeters(place, { lat: stamp.lat, lng: stamp.lng })
      : undefined;
  return { verdict: geoVerdict(stamp, jarakMeter, runRadius), jarakMeter };
}

/** Where the stop is checked against before the close dialog is filed. */
async function checkLocation(stopId: string): Promise<StopReceipt["lokasi"]> {
  const { stamp } = await position();
  return lokasiFor(stopId, stamp);
}

/** What the screen shows back after a filing: the documents, and the count. */
function receipt(rows: DeliveryResponse[], realisasi: number): StopReceipt {
  return { kode: rows.map((r) => r.delivery_number).join(", "), realisasi };
}

/* ------------------------------------------------------------------------- *
 * Filings, through the outbox
 *
 * Every filing is written to the outbox, sent, and removed once the server
 * has answered (lib/outbox.ts). One the network did not carry stays, and is
 * replayed when the phone is back online -- with its own Idempotency-Key, so
 * a first attempt that did reach the server is not filed twice.
 * ------------------------------------------------------------------------- */

const outbox: OutboxStore = typeof indexedDB === "undefined" ? memoryOutbox() : indexedDbOutbox;
const versions: Versions = new Map();

const transport: Transport = async (filing, request) => {
  const path =
    filing.kind === "photo"
      ? `/attachments/delivery/${filing.documentId}`
      : `/deliveries/${filing.documentId}/${filing.kind}`;
  const answer = await send<{ version?: number }>("post", path, request.body, {
    idempotencyKey: filing.id,
    contentType: request.contentType,
    timeout: filing.kind === "photo" ? 60_000 : undefined,
  });
  return filing.kind === "photo" ? undefined : answer?.version;
};

/**
 * Files one kind of filing for each document, in order.
 *
 * Sent at once unless something for the same document is already waiting:
 * then it queues behind it, unbuilt, because the version it needs is the one
 * the waiting filing's answer will carry. A document with this same filing
 * already waiting is skipped -- the driver tapping twice, offline, files once.
 * The network failing part way queues the rest; a refusal is thrown, as it
 * always was, and the screen shows it.
 */
async function file(
  stopId: string,
  kind: FilingKind,
  rows: DeliveryResponse[],
  extra: (row: DeliveryResponse) => Pick<Filing, "fields" | "photo">,
): Promise<{ queued: boolean }> {
  const waiting = (await outbox.all()).filter((f) => f.state === "pending");
  let queued = false;
  for (const row of rows) {
    if (waiting.some((f) => f.documentId === row.id && f.kind === kind)) {
      queued = true;
      continue;
    }
    const filing: Filing = {
      id: crypto.randomUUID(),
      seq: nextSeq(),
      documentId: row.id,
      stopId,
      kind,
      state: "pending",
      ...extra(row),
    };
    const behind = queued || waiting.some((f) => f.documentId === row.id);
    if (!behind) filing.sent = await buildRequest(filing, versions);
    await outbox.put(filing);
    if (behind || !filing.sent) {
      queued = true;
      continue;
    }
    try {
      const version = await transport(filing, filing.sent);
      if (version !== undefined) versions.set(row.id, version);
      await outbox.remove(filing.id);
    } catch (error) {
      if (isOffline(error)) {
        queued = true;
        continue;
      }
      await outbox.remove(filing.id);
      throw error;
    }
  }
  return { queued };
}

async function departStop(deliveryId: string): Promise<StopReceipt> {
  const rows = documentsFor(deliveryId);
  const { fields: at } = await position();
  // Sequential, not concurrent: each call carries the version it read, and the
  // server's own error is more useful than whichever of five parallel
  // rejections happened to land first.
  const { queued } = await file(deliveryId, "depart",
    rows.filter((r) => isOpen(r) && !r.departed_at), () => ({ fields: { ...at } }));
  return { ...receipt(rows, 0), tertunda: queued };
}

/**
 * Reaching the gate.
 *
 * The service will stamp `arrived_at` itself at completion if this is never
 * filed, which keeps a drop closeable — but then arrival and completion share
 * an instant and the wait at the gate reads as zero for every stop, every day.
 * That gap is the one thing a delay report is actually made of, so the driver
 * files it: one tap on arriving, before anything is unloaded.
 *
 * Already-arrived documents are skipped rather than refiled. The service
 * refuses a second arrival, and it is right to — the truck arrived once.
 */
async function arriveStop(deliveryId: string): Promise<StopReceipt> {
  const rows = documentsFor(deliveryId);
  const { fields: at, stamp } = await position();
  const { queued } = await file(deliveryId, "arrive",
    rows.filter((r) => isOpen(r) && !r.arrived_at), () => ({ fields: { ...at } }));
  return { ...receipt(rows, 0), tertunda: queued, lokasi: lokasiFor(deliveryId, stamp) };
}

/**
 * Closing a stop.
 *
 * `recipient_name` is filed per document and the service writes it to
 * core.delivery_proofs as evidence, alongside the position this call carries.
 * It is a name, not a signature — see the proof_type vocabulary — and a drop
 * where the driver could not get one is filed without it rather than with a
 * placeholder.
 */
async function completeStop(input: CompleteStopInput): Promise<StopReceipt> {
  const rows = documentsFor(input.deliveryId);
  const { fields: at } = await position();
  const filed = new Map(input.lines.map((l) => [l.productId, l]));

  let realisasi = 0;
  const open = rows.filter(isOpen);
  const delivered = new Map(open.map((row) => {
    const line = filed.get(row.product_id ?? "");
    // A document the driver did not file against is closed at what it carried:
    // leaving it open would hold the whole stop open, and the count they did
    // not change is the count that left the yard.
    return [row.id, line ? line.realisasi : row.dispatched_qty] as const;
  }));
  for (const qty of delivered.values()) realisasi += qty;

  const { queued } = await file(input.deliveryId, "complete", open, (row) => {
    const qty = delivered.get(row.id) ?? row.dispatched_qty;
    const line = filed.get(row.product_id ?? "");
    return {
      fields: {
        delivered_qty: qty,
        returned_qty: Math.max(0, row.dispatched_qty - qty),
        empties_collected: line?.kembali ?? 0,
        recipient_name: input.diterimaOleh,
        note: input.catatan,
        ...at,
      },
    };
  });
  const closed: StopReceipt = { ...receipt(rows, realisasi), tertunda: queued };

  // After the completion, not before: the photo is evidence of the drop, and
  // a failed upload on a weak signal must not leave the delivery itself
  // unrecorded. One photo per stop, on its first surat jalan; the office
  // reads every surat jalan of the stop. Queued like the filings, so a photo
  // taken with no signal is not lost.
  if (input.foto) {
    try {
      const blob = await downscaleImage(input.foto);
      const photo = await file(input.deliveryId, "photo", rows.slice(0, 1), () => ({
        photo: { blob, name: blob.name || input.foto!.name },
      }));
      closed.tertunda = closed.tertunda || photo.queued;
    } catch (error) {
      closed.fotoGagal = error instanceof Error ? error.message : "Foto gagal diunggah";
    }
  }
  return closed;
}

async function holdStop(input: { deliveryId: string; catatan: string }): Promise<StopReceipt> {
  const rows = documentsFor(input.deliveryId);
  const { fields: at } = await position();
  const { queued } = await file(input.deliveryId, "fail", rows.filter(isOpen), () => ({
    fields: { failure_reason: input.catatan, ...at },
  }));
  return { ...receipt(rows, 0), tertunda: queued };
}

/** What is still waiting on this device, oldest first. */
async function pendingFilings(): Promise<Filing[]> {
  return (await outbox.all()).sort((a, b) => a.seq - b.seq);
}

/** Sends what is waiting. Safe to call at any time, and repeatedly. */
async function replayFilings(): Promise<ReplayResult> {
  return replay(outbox, transport, versions);
}

/** Drops a filing the server refused, once the driver has seen why. */
async function discardFiling(id: string): Promise<void> {
  await outbox.remove(id);
}

/**
 * Reports a batch of positions for the run tracker.
 *
 * No trip id here either, for the same reason as every other write in this
 * file: the service resolves the driver's own currently-dispatched run from
 * the session, and an id in flight would be an id a caller could change.
 */
async function postGpsFixes(fixes: GpsFixInput[]): Promise<void> {
  await send("post", "/gps/tracks", {
    fixes: fixes.map((f) => ({
      tracked_at: f.at,
      latitude: f.lat,
      longitude: f.lng,
      speed_kmh: f.speedKmh,
      heading_deg: f.heading,
      accuracy_m: f.accuracy,
    })),
  });
}

export const sopirApiHttp: SopirApi = {
  getMyRun,
  departStop,
  arriveStop,
  completeStop,
  holdStop,
  checkLocation,
  pendingFilings,
  replayFilings,
  discardFiling,
  postGpsFixes,
};
