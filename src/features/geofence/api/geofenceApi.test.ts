import { expect, it, vi, beforeEach, describe } from "vitest";

/**
 * The geofence mapping, and the two places it can be quietly wrong.
 *
 * A polygon crosses the wire twice in different shapes: out as a list of
 * vertices, back as a GeoJSON string that orders coordinates [lng, lat] and
 * closes its own ring. Get the swap wrong and a fence in Central Java is drawn
 * in the Indian Ocean, with nothing erroring. Get the closing vertex wrong and
 * the map stacks a duplicate handle on another and editing goes strange.
 *
 * The other is the version round trip: an update that does not echo the
 * version the row has right now is refused 409, and two dispatchers editing
 * one fence must not silently overwrite each other.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  // getAllPages walks pages through getList; one mocked call is one page.
  getAllPages: async (...args: unknown[]) => ({ items: (await getList(...args)).items, truncated: false }),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { geofenceApiHttp } = await import("./geofenceApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function circleWire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    branch_id: "22222222-2222-4222-8222-222222222222",
    code: "pool-salatiga",
    name: "Pool Salatiga",
    rule_type: "circle" as const,
    center_latitude: -7.3305,
    center_longitude: 110.5084,
    radius_m: 500,
    subject_type: "depot",
    violation_mode: "exit" as const,
    severity: "warning" as const,
    status: "atv",
    version: 3,
    ...overrides,
  };
}

function polygonWire(overrides: Record<string, unknown> = {}) {
  return {
    ...circleWire(),
    rule_type: "polygon" as const,
    center_latitude: undefined,
    center_longitude: undefined,
    radius_m: undefined,
    // As PostGIS returns it: [lng, lat], and the ring closed.
    boundary_geojson: JSON.stringify({
      type: "Polygon",
      coordinates: [
        [
          [110.50, -7.30],
          [110.52, -7.31],
          [110.50, -7.33],
          [110.50, -7.30],
        ],
      ],
    }),
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

describe("reading rules", () => {
  it("keeps latitude and longitude the right way round on a polygon", async () => {
    getList.mockResolvedValue({ items: [polygonWire()], pagination: {} });
    const [rule] = await geofenceApiHttp.getGeofenceRules();

    expect(rule.bentuk.jenis).toBe("Poligon");
    if (rule.bentuk.jenis !== "Poligon") throw new Error("unreachable");
    // GeoJSON said [110.50, -7.30]; a fence in Central Java is lat -7, lng 110.
    expect(rule.bentuk.batas[0]).toEqual({ lat: -7.3, lng: 110.5 });
  });

  it("drops the closing vertex PostGIS adds", async () => {
    getList.mockResolvedValue({ items: [polygonWire()], pagination: {} });
    const [rule] = await geofenceApiHttp.getGeofenceRules();

    if (rule.bentuk.jenis !== "Poligon") throw new Error("unreachable");
    // Four points on the wire, three corners drawn.
    expect(rule.bentuk.batas).toHaveLength(3);
    expect(rule.bentuk.batas[0]).not.toEqual(
      rule.bentuk.batas[rule.bentuk.batas.length - 1],
    );
  });

  it("reads a circle as a centre and a radius, with no boundary", async () => {
    getList.mockResolvedValue({ items: [circleWire()], pagination: {} });
    const [rule] = await geofenceApiHttp.getGeofenceRules();

    expect(rule.bentuk).toEqual({
      jenis: "Lingkaran",
      pusat: { lat: -7.3305, lng: 110.5084 },
      radiusMeter: 500,
    });
  });

  it("asks only for fences that still guard something", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });
    await geofenceApiHttp.getGeofenceRules();

    // A deleted rule's row survives so past alerts keep resolving; it must not
    // come back in the list of live fences.
    expect(getList).toHaveBeenCalledWith(
      "/geofence-rules",
      expect.objectContaining({
        filters: [{ field: "status", operator: "eq", value: "atv" }],
      }),
    );
  });

  it("translates the service's vocabulary rather than showing it raw", async () => {
    getList.mockResolvedValue({
      items: [
        circleWire({
          subject_type: "outlet_territory",
          violation_mode: "enter",
          severity: "critical",
        }),
      ],
      pagination: {},
    });
    const [rule] = await geofenceApiHttp.getGeofenceRules();

    expect(rule.subjek).toBe("Wilayah outlet");
    expect(rule.mode).toBe("Masuk");
    expect(rule.keparahan).toBe("Kritis");
  });
});

describe("writing a rule", () => {
  it("sends a polygon as vertices, longitude beside latitude", async () => {
    send.mockResolvedValue(polygonWire());
    await geofenceApiHttp.createOrUpdateGeofenceRule({
      kode: "wilayah",
      nama: "Wilayah",
      subjek: "Area terlarang",
      mode: "Masuk",
      keparahan: "Kritis",
      bentuk: {
        jenis: "Poligon",
        batas: [
          { lat: -7.3, lng: 110.5 },
          { lat: -7.31, lng: 110.52 },
          { lat: -7.33, lng: 110.5 },
        ],
      },
    });

    const [, , body] = send.mock.calls[0];
    expect(body).toMatchObject({
      rule_type: "polygon",
      boundary: [
        { latitude: -7.3, longitude: 110.5 },
        { latitude: -7.31, longitude: 110.52 },
        { latitude: -7.33, longitude: 110.5 },
      ],
    });
    // A polygon must carry no centre: the service refuses one with a 422.
    expect(body).not.toHaveProperty("center_latitude");
    expect(body).not.toHaveProperty("radius_m");
  });

  it("sends a circle as a centre and radius, with no boundary", async () => {
    send.mockResolvedValue(circleWire());
    await geofenceApiHttp.createOrUpdateGeofenceRule({
      kode: "depot",
      nama: "Depot",
      subjek: "Depot",
      mode: "Keluar",
      keparahan: "Peringatan",
      bentuk: { jenis: "Lingkaran", pusat: { lat: -7.3305, lng: 110.5084 }, radiusMeter: 500 },
    });

    const [, , body] = send.mock.calls[0];
    expect(body).toMatchObject({
      rule_type: "circle",
      center_latitude: -7.3305,
      center_longitude: 110.5084,
      radius_m: 500,
    });
    expect(body).not.toHaveProperty("boundary");
  });

  it("echoes back the version the row has now, not one the form remembered", async () => {
    getOne.mockResolvedValue(circleWire({ version: 9 }));
    send.mockResolvedValue(circleWire({ version: 10 }));

    await geofenceApiHttp.createOrUpdateGeofenceRule({
      id: ID,
      kode: "depot",
      nama: "Depot Baru",
      subjek: "Depot",
      mode: "Keluar",
      keparahan: "Peringatan",
    });

    expect(getOne).toHaveBeenCalledWith(`/geofence-rules/${ID}`);
    const [method, path, body] = send.mock.calls[0];
    expect([method, path]).toEqual(["put", `/geofence-rules/${ID}`]);
    expect(body).toMatchObject({ version: 9 });
  });

  it("never sends rule_type on an update", async () => {
    getOne.mockResolvedValue(circleWire());
    send.mockResolvedValue(circleWire());

    await geofenceApiHttp.createOrUpdateGeofenceRule({
      id: ID,
      kode: "depot",
      nama: "Depot",
      subjek: "Depot",
      mode: "Keluar",
      keparahan: "Peringatan",
      bentuk: { jenis: "Lingkaran", pusat: { lat: -7.33, lng: 110.5 }, radiusMeter: 750 },
    });

    // The shape is immutable after create: the service has no field for it,
    // and a shape belonging to the other kind is a 422 naming it.
    const [, , body] = send.mock.calls[0];
    expect(body).not.toHaveProperty("rule_type");
    expect(body).toMatchObject({ radius_m: 750 });
  });
});

describe("alerts", () => {
  function alertWire(overrides: Record<string, unknown> = {}) {
    return {
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      geofence_rule_id: ID,
      violation_type: "exit" as const,
      latitude: -7.35,
      longitude: 110.53,
      distance_from_boundary_m: 2715,
      detected_at: "2026-09-07T13:49:44Z",
      alert_status: "open" as const,
      version: 1,
      ...overrides,
    };
  }

  it("keeps an alert's coordinates the right way round", async () => {
    getList.mockResolvedValue({ items: [alertWire()], pagination: {} });
    const [alert] = await geofenceApiHttp.getGeofenceAlerts();

    expect(alert.posisi).toEqual({ lat: -7.35, lng: 110.53 });
    expect(alert.jarakMeter).toBe(2715);
    expect(alert.status).toBe("Terbuka");
  });

  it("leaves the driver absent on an alert with no run behind it", async () => {
    // A depot or restricted-area breach can fire with no trip involved.
    getList.mockResolvedValue({ items: [alertWire()], pagination: {} });
    const [alert] = await geofenceApiHttp.getGeofenceAlerts();

    expect(alert.driverId).toBeUndefined();
  });

  it("asks for one status when the panel filters", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });
    await geofenceApiHttp.getGeofenceAlerts({ status: "Terbuka" });

    expect(getList).toHaveBeenCalledWith(
      "/geofence-alerts",
      expect.objectContaining({
        filters: [{ field: "alert_status", operator: "eq", value: "open" }],
      }),
    );
  });

  it("sends the service's own status word when acknowledging", async () => {
    getOne.mockResolvedValue(alertWire({ version: 4 }));
    send.mockResolvedValue(alertWire({ alert_status: "acknowledged", version: 5 }));

    const updated = await geofenceApiHttp.setGeofenceAlertStatus({
      id: "aaaaaaaa-1111-4111-8111-111111111111",
      status: "Ditinjau",
      catatan: "Menghubungi sopir",
    });

    const [method, , body] = send.mock.calls[0];
    expect(method).toBe("patch");
    expect(body).toMatchObject({
      version: 4,
      status: "acknowledged",
      notes: "Menghubungi sopir",
    });
    expect(updated.status).toBe("Ditinjau");
  });
});
