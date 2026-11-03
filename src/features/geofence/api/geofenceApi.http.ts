/**
 * Geofence rules and alerts, against the real API.
 *
 * # The asymmetry in how a polygon travels
 *
 * A polygon is written as a list of vertices and read back as a GeoJSON
 * string. That is the service's shape, not an accident of this adapter: the
 * boundary is a PostGIS geography, written through ST_GeogFromText and read
 * through ST_AsGeoJSON, and the ring it returns is closed (its last vertex
 * repeats its first) even when the ring sent was open. So `toShape` drops that
 * repeat — a caller who submitted three corners should see three corners back,
 * or the map draws a duplicate handle on top of another and editing gets
 * strange.
 *
 * GeoJSON also orders coordinates [lng, lat], which is the opposite of every
 * label in this console. That swap happens exactly once, here.
 *
 * # Nothing is invented
 *
 * A rule the service has not got a field for is not filled in from somewhere
 * else. `outletId` is absent unless the rule is an outlet_territory one, and
 * an alert with no trip carries no driver — an alert can be raised against a
 * depot fence with no run involved at all.
 */
import { getAllPages, getList, getOne, send } from "@/lib/api";
import type {
  GeofenceAlertFilters,
  GeofenceAlertStatusEntity,
  GeofenceAlertView,
  GeofenceApi,
  GeofenceModeEntity,
  GeofenceRuleInput,
  GeofenceRuleView,
  GeofenceSeverityEntity,
  GeofenceShapeEntity,
  GeofenceSubjectEntity,
  LatLng,
} from "./contract";

/** Mirrors the backend's RuleResponse. */
interface RuleResponse {
  id: string;
  branch_id: string;
  code: string;
  name: string;
  description?: string;
  rule_type: "circle" | "polygon";
  center_latitude?: number;
  center_longitude?: number;
  radius_m?: number;
  boundary_geojson?: string;
  subject_type: string;
  outlet_id?: string;
  violation_mode: "exit" | "enter";
  severity: "info" | "warning" | "critical";
  status: string;
  version: number;
}

/** Mirrors the backend's AlertResponse. */
interface AlertResponse {
  id: string;
  geofence_rule_id: string;
  trip_id?: string;
  driver_id?: string;
  violation_type: "exit" | "enter";
  latitude: number;
  longitude: number;
  distance_from_boundary_m?: number;
  detected_at: string;
  alert_status: "open" | "acknowledged" | "resolved" | "false_positive";
  notes?: string;
  version: number;
}

/** 100 is every list definition's MaxPageSize; the server refuses more. */
const PAGE_SIZE = 100;

const SUBJECT_IN: Record<string, GeofenceSubjectEntity> = {
  route: "Rute",
  outlet_territory: "Wilayah outlet",
  depot: "Depot",
  restricted_area: "Area terlarang",
};
const SUBJECT_OUT: Record<GeofenceSubjectEntity, string> = {
  Rute: "route",
  "Wilayah outlet": "outlet_territory",
  Depot: "depot",
  "Area terlarang": "restricted_area",
};

const SEVERITY_IN: Record<string, GeofenceSeverityEntity> = {
  info: "Info",
  warning: "Peringatan",
  critical: "Kritis",
};
const SEVERITY_OUT: Record<GeofenceSeverityEntity, string> = {
  Info: "info",
  Peringatan: "warning",
  Kritis: "critical",
};

const ALERT_STATUS_IN: Record<string, GeofenceAlertStatusEntity> = {
  open: "Terbuka",
  acknowledged: "Ditinjau",
  resolved: "Selesai",
  false_positive: "Bukan pelanggaran",
};
const ALERT_STATUS_OUT: Record<string, string> = {
  Ditinjau: "acknowledged",
  Selesai: "resolved",
  "Bukan pelanggaran": "false_positive",
};

const modeIn = (mode: "exit" | "enter"): GeofenceModeEntity =>
  mode === "enter" ? "Masuk" : "Keluar";
const modeOut = (mode: GeofenceModeEntity): "exit" | "enter" =>
  mode === "Masuk" ? "enter" : "exit";

/**
 * The stored boundary, back as the vertices somebody drew.
 *
 * Returns undefined rather than an empty ring when the GeoJSON cannot be read:
 * a fence drawn as no shape at all would render as nothing on the map while
 * still claiming to guard something.
 */
function toBoundary(geojson: string | undefined): LatLng[] | undefined {
  if (!geojson) return undefined;
  try {
    const parsed = JSON.parse(geojson) as {
      type?: string;
      coordinates?: [number, number][][];
    };
    const ring = parsed.coordinates?.[0];
    if (!ring?.length) return undefined;

    // [lng, lat] on the wire, {lat, lng} in the console. The one swap.
    const points = ring.map(([lng, lat]) => ({ lat, lng }));
    const first = points[0];
    const last = points[points.length - 1];
    // PostGIS closes the ring; the caller drew it open.
    if (points.length > 1 && first.lat === last.lat && first.lng === last.lng) {
      points.pop();
    }
    return points;
  } catch {
    return undefined;
  }
}

function toShape(row: RuleResponse): GeofenceShapeEntity {
  if (row.rule_type === "polygon") {
    return { jenis: "Poligon", batas: toBoundary(row.boundary_geojson) ?? [] };
  }
  return {
    jenis: "Lingkaran",
    pusat: { lat: row.center_latitude ?? 0, lng: row.center_longitude ?? 0 },
    radiusMeter: row.radius_m ?? 0,
  };
}

function toRuleView(row: RuleResponse): GeofenceRuleView {
  return {
    id: row.id,
    kode: row.code,
    nama: row.name,
    keterangan: row.description,
    bentuk: toShape(row),
    subjek: SUBJECT_IN[row.subject_type] ?? "Rute",
    outletId: row.outlet_id,
    mode: modeIn(row.violation_mode),
    keparahan: SEVERITY_IN[row.severity] ?? "Peringatan",
    aktif: row.status === "atv",
    version: row.version,
  };
}

function toAlertView(row: AlertResponse): GeofenceAlertView {
  return {
    id: row.id,
    ruleId: row.geofence_rule_id,
    pelanggaran: modeIn(row.violation_type),
    posisi: { lat: row.latitude, lng: row.longitude },
    jarakMeter: row.distance_from_boundary_m,
    terdeteksi: row.detected_at,
    status: ALERT_STATUS_IN[row.alert_status] ?? "Terbuka",
    driverId: row.driver_id,
    catatan: row.notes,
    version: row.version,
  };
}

/** The shape half of a write, sent only for the kind of rule it belongs to. */
function shapeToWire(shape: GeofenceShapeEntity): Record<string, unknown> {
  if (shape.jenis === "Poligon") {
    return {
      boundary: shape.batas.map((p) => ({ latitude: p.lat, longitude: p.lng })),
    };
  }
  return {
    center_latitude: shape.pusat.lat,
    center_longitude: shape.pusat.lng,
    radius_m: shape.radiusMeter,
  };
}

async function getGeofenceRules(): Promise<GeofenceRuleView[]> {
  const page = await getAllPages<RuleResponse>("/geofence-rules", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "code" }],
    // Never show soft-deleted fences: the row survives a delete so past alerts
    // keep resolving, but it guards nothing any more.
    filters: [{ field: "status", operator: "eq" as const, value: "atv" }],
  });
  return page.items.map(toRuleView);
}

async function createOrUpdateGeofenceRule(
  input: GeofenceRuleInput,
): Promise<GeofenceRuleView> {
  const common = {
    name: input.nama,
    description: input.keterangan,
    subject_type: SUBJECT_OUT[input.subjek],
    outlet_id: input.outletId,
    violation_mode: modeOut(input.mode),
    severity: SEVERITY_OUT[input.keparahan],
  };

  if (!input.id) {
    if (!input.bentuk) {
      throw new Error("Bentuk pagar wajib dipilih saat membuat aturan baru.");
    }
    return toRuleView(
      await send<RuleResponse>("post", "/geofence-rules", {
        ...common,
        code: input.kode,
        rule_type: input.bentuk.jenis === "Poligon" ? "polygon" : "circle",
        ...shapeToWire(input.bentuk),
      }),
    );
  }

  // The version the row has right now, not one this form remembered: an
  // update without it is refused with 409, which is the point.
  const current = await getOne<RuleResponse>(`/geofence-rules/${input.id}`);
  return toRuleView(
    await send<RuleResponse>("put", `/geofence-rules/${input.id}`, {
      ...common,
      version: current.version,
      // rule_type is never sent: the service has no field for it on update,
      // and sending a shape belonging to the other kind is a 422 naming it.
      ...(input.bentuk ? shapeToWire(input.bentuk) : {}),
      ...(input.aktif === undefined ? {} : { status: input.aktif ? "atv" : "ina" }),
    }),
  );
}

async function removeGeofenceRule(id: string): Promise<void> {
  await send("delete", `/geofence-rules/${id}`);
}

async function getGeofenceAlerts(
  filters?: GeofenceAlertFilters,
): Promise<GeofenceAlertView[]> {
  const wire = filters?.status && filters.status !== "Semua"
    ? ALERT_STATUS_OUT[filters.status] ?? "open"
    : undefined;

  const page = await getList<AlertResponse>("/geofence-alerts", {
    pageSize: PAGE_SIZE,
    sort: [{ field: "detected_at", direction: "desc" as const }],
    filters: wire ? [{ field: "alert_status", operator: "eq" as const, value: wire }] : [],
  });
  return page.items.map(toAlertView);
}

async function setGeofenceAlertStatus(input: {
  id: string;
  status: Exclude<GeofenceAlertStatusEntity, "Terbuka">;
  catatan?: string;
}): Promise<GeofenceAlertView> {
  const current = await getOne<AlertResponse>(`/geofence-alerts/${input.id}`);
  return toAlertView(
    await send<AlertResponse>("patch", `/geofence-alerts/${input.id}`, {
      version: current.version,
      status: ALERT_STATUS_OUT[input.status],
      notes: input.catatan,
    }),
  );
}

export const geofenceApiHttp: GeofenceApi = {
  getGeofenceRules,
  createOrUpdateGeofenceRule,
  removeGeofenceRule,
  getGeofenceAlerts,
  setGeofenceAlertStatus,
};
