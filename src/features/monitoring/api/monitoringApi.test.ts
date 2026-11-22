import { expect, it, vi, beforeEach, describe } from "vitest";

/**
 * The dispatcher's board, and the translation the split leaves this adapter
 * holding.
 *
 * The server already groups per-product deliveries into stops and computes
 * the totals; what this adapter owns is turning that wire shape into the
 * view the board renders, deriving what genuinely can be derived (a driver's
 * runtime status, the wait at a gate) and leaving absent what cannot (an
 * ETA, a per-stop clock time) rather than inventing either.
 */

const getOne = vi.fn();
const send = vi.fn();
const getSettings = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: vi.fn(),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

vi.mock("@/features/settings/api/settingsApi", () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
}));

vi.mock("@/lib/export", () => ({
  printDocument: vi.fn(),
}));

const { monitoringApiHttp } = await import("./monitoringApi.http");

const D1 = "aaaaaaaa-1111-4111-8111-111111111111";
const D2 = "bbbbbbbb-2222-4222-8222-222222222222";
const DRIVER = "cccccccc-3333-4333-8333-333333333333";
const OUTLET = "dddddddd-4444-4444-8444-444444444444";
const STOP = "eeeeeeee-5555-4555-8555-555555555555";

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: D1,
    delivery_number: "SJ-SLT-20260906-0001",
    product_id: "prod-1",
    product_name: "LPG 3 Kg",
    dispatched_qty: 50,
    delivered_qty: 0,
    returned_qty: 0,
    empties_collected: 0,
    delivery_status: "pending",
    version: 1,
    ...overrides,
  };
}

/** One outlet, one product, one stop. */
function stop(overrides: Record<string, unknown> = {}) {
  return {
    stop_id: STOP,
    trip_id: "trip-1",
    sequence_no: 1,
    driver_id: DRIVER,
    outlet_id: OUTLET,
    outlet_code: "PGKL-0001",
    outlet_name: "Pangkalan Melati",
    outlet_owner: "Bu Sri",
    outlet_address: "Jl. Melati No. 1",
    outlet_district: "Ngaliyan",
    latitude: -6.9932,
    longitude: 110.3453,
    dispatched_qty: 50,
    delivered_qty: 0,
    returned_qty: 0,
    stop_status: "pending",
    deliveries: [delivery()],
    ...overrides,
  };
}

function driver(overrides: Record<string, unknown> = {}) {
  return {
    driver_id: DRIVER,
    driver_name: "Slamet",
    employment_status: "active",
    plate: "H 1234 AB",
    vehicle_type: "truck",
    capacity_qty: 200,
    loaded_qty: 50,
    stops_total: 1,
    stops_done: 0,
    ...overrides,
  };
}

function board(overrides: Record<string, unknown> = {}) {
  return {
    date_from: "2026-09-06",
    date_to: "2026-09-06",
    generated_at: "2026-09-06T03:00:00Z",
    drivers: [driver()],
    stops: [stop()],
    totals: { target: 50, realisasi: 0, selesai: 0, proses: 0, antrian: 1, tertunda: 0 },
    ...overrides,
  };
}

beforeEach(() => {
  getOne.mockReset();
  send.mockReset();
  getSettings.mockReset();
  getSettings.mockResolvedValue({ namaPerusahaan: "PT Bimbo Salatiga", nomorAgen: "SA-01" });
  // The server answers a filing with the updated document; mocking that
  // rather than an empty object lets a write assert what it actually sent.
  send.mockImplementation(async () => ({}));
});

async function load(payload: Record<string, unknown> = board()) {
  getOne.mockImplementation(async () => payload);
  return monitoringApiHttp.getMonitoringSnapshot({ from: "2026-09-06", to: "2026-09-06" });
}

describe("reading the board", () => {
  it("requests the range as query parameters, not a body", async () => {
    await load();
    expect(getOne).toHaveBeenCalledWith("/monitoring/board?date_from=2026-09-06&date_to=2026-09-06");
  });

  it("keeps latitude and longitude the right way round", async () => {
    const snap = await load();
    expect(snap.rows[0].coord).toEqual({ lat: -6.9932, lng: 110.3453 });
  });

  it("orders a round by sequence_no, not by an empty clock string", async () => {
    const snap = await load(board({ stops: [stop({ sequence_no: 3 })] }));
    expect(snap.rows[0].urutan).toBe(3);
    expect(snap.rows[0].jamRencana).toBe("");
  });

  it("names every document a stop carries", async () => {
    const snap = await load(
      board({
        stops: [
          stop({
            deliveries: [
              delivery(),
              delivery({ id: D2, delivery_number: "SJ-SLT-20260906-0002" }),
            ],
          }),
        ],
      }),
    );
    expect(snap.rows[0].kode).toBe("SJ-SLT-20260906-0001, SJ-SLT-20260906-0002");
  });

  it.each([
    ["pending", "Antrian"],
    ["on_route", "Proses"],
    ["delivered", "Selesai"],
    ["partial", "Selesai"],
    ["failed", "Tertunda"],
  ])("maps stop_status %s to %s", async (stopStatus, expected) => {
    const snap = await load(board({ stops: [stop({ stop_status: stopStatus })] }));
    expect(snap.rows[0].status).toBe(expected);
  });

  it("reports the totals the server computed rather than recomputing them", async () => {
    // Deliberately disagreeing with what the single row would sum to, so a
    // client-side recomputation would be caught changing the number.
    const snap = await load(
      board({ totals: { target: 999, realisasi: 999, selesai: 999, proses: 0, antrian: 0, tertunda: 0 } }),
    );
    expect(snap.totals).toEqual({ target: 999, realisasi: 999, selesai: 999, proses: 0, antrian: 0, tertunda: 0 });
  });

  it("uses the server's clock for the sync timestamp", async () => {
    const snap = await load();
    expect(snap.lastSyncAt).toBe("2026-09-06T03:00:00Z");
  });

  it("leaves eta absent rather than inventing one", async () => {
    const snap = await load();
    expect(snap.drivers[0].eta).toBeUndefined();
  });

  it("judges a filing against the radius the board carried", async () => {
    const snap = await load(
      board({
        geofence_radius_m: 100,
        stops: [stop({ filed_at: "2026-09-06T03:05:00Z", filed_distance_m: 50 })],
      }),
    );
    expect(snap.rows[0].lokasi?.verdict).toBe("sesuai");
    expect(snap.rows[0].lokasi?.jarakMeter).toBe(50);
  });

  it("falls back to a default radius when no ancestor ever set one", async () => {
    const snap = await load(
      board({
        geofence_radius_m: undefined,
        // Well inside the documented 150m fallback.
        stops: [stop({ filed_at: "2026-09-06T03:05:00Z", filed_distance_m: 90 })],
      }),
    );
    expect(snap.rows[0].lokasi?.verdict).toBe("sesuai");
  });

  it("reports a stop with no filing as unrecorded, not as compliant", async () => {
    const snap = await load(board({ stops: [stop({ filed_at: undefined })] }));
    expect(snap.rows[0].lokasi).toBeUndefined();
  });

  it("calls a wide fix rough rather than accusing the driver of being far away", async () => {
    const snap = await load(
      board({
        geofence_radius_m: 100,
        stops: [
          stop({
            filed_at: "2026-09-06T03:05:00Z",
            filed_distance_m: 900,
            // A cell-tower triangulation: it cannot confirm or deny a 100m
            // geofence, and calling it "jauh" accuses a driver of something
            // this fix simply cannot establish.
            filed_accuracy_m: 2000,
          }),
        ],
      }),
    );
    expect(snap.rows[0].lokasi?.verdict).toBe("kasar");
  });

  it("still judges a filing whose device stated a tight accuracy", async () => {
    const snap = await load(
      board({
        geofence_radius_m: 100,
        stops: [
          stop({
            filed_at: "2026-09-06T03:05:00Z",
            filed_distance_m: 900,
            filed_accuracy_m: 8,
          }),
        ],
      }),
    );
    expect(snap.rows[0].lokasi?.verdict).toBe("jauh");
  });
});

describe("the driver card", () => {
  it("shows Cuti for a driver on leave, regardless of the day's stops", async () => {
    const snap = await load(
      board({ drivers: [driver({ employment_status: "on_leave" })] }),
    );
    expect(snap.drivers[0].status).toBe("Cuti");
  });

  it("shows Selesai once every stop has settled", async () => {
    const snap = await load(
      board({ stops: [stop({ stop_status: "delivered" })] }),
    );
    expect(snap.drivers[0].status).toBe("Selesai");
  });

  // Round 4 R4-11: five closed runs, one with a failed stop, all read
  // "Dalam Perjalanan" and "5 armada berjalan".
  it("shows a closed run as Selesai even with a failed stop", async () => {
    const snap = await load(
      board({
        drivers: [driver({ trip_status: "completed", departed_at: "2026-09-06T01:00:00Z" })],
        stops: [stop({ stop_status: "failed" })],
      }),
    );
    expect(snap.drivers[0].status).toBe("Selesai");
  });

  it("counts a failed stop as settled for a run still open", async () => {
    const snap = await load(
      board({
        drivers: [driver({ trip_status: "dispatched", departed_at: "2026-09-06T01:00:00Z" })],
        stops: [stop({ stop_status: "delivered" }), stop({ id: "s2", stop_status: "failed" })],
      }),
    );
    expect(snap.drivers[0].status).toBe("Selesai");
  });

  it("shows Bongkar Muat only once the truck has arrived at the running stop", async () => {
    const snap = await load(
      board({ stops: [stop({ stop_status: "on_route", arrived_at: "2026-09-06T03:00:00Z" })] }),
    );
    expect(snap.drivers[0].status).toBe("Bongkar Muat");
  });

  it("shows Dalam Perjalanan for a departed run with nobody at a gate yet", async () => {
    const snap = await load(
      board({
        drivers: [driver({ departed_at: "2026-09-06T02:00:00Z" })],
        stops: [stop({ stop_status: "on_route" })],
      }),
    );
    expect(snap.drivers[0].status).toBe("Dalam Perjalanan");
  });

  it("shows Standby for a run that has not left", async () => {
    const snap = await load();
    expect(snap.drivers[0].status).toBe("Standby");
  });

  it("reports the wait at the gate from the real arrival, not a fixed guess", async () => {
    const arrivedAt = new Date(Date.now() - 15 * 60_000).toISOString();
    const snap = await load(
      board({ stops: [stop({ stop_status: "on_route", arrived_at: arrivedAt })] }),
    );
    expect(snap.drivers[0].durasi).toMatch(/±1[4-6] menit/);
  });

  it("leaves durasi absent for a driver who has not arrived anywhere", async () => {
    const snap = await load();
    expect(snap.drivers[0].durasi).toBeUndefined();
  });
});

describe("the map assignment", () => {
  // Round 4 R4-11: a closed run kept counting in "armada berjalan".
  it("does not count a closed run as on the road", async () => {
    const open = await load(board({ drivers: [driver({ trip_status: "dispatched", departed_at: "2026-09-06T01:00:00Z" })] }));
    expect(open.assignments[0].berjalan).toBe(true);
    const closed = await load(board({ drivers: [driver({ trip_status: "completed", departed_at: "2026-09-06T01:00:00Z" })] }));
    expect(closed.assignments[0].berjalan).toBe(false);
    expect(closed.assignments[0].selesai).toBe(true);
  });

  it("draws a truck at its reported position when one exists", async () => {
    const snap = await load(
      board({ drivers: [driver({ latitude: -6.99, longitude: 110.34 })] }),
    );
    expect(snap.assignments[0].driverCoord).toEqual({ lat: -6.99, lng: 110.34 });
  });

  it("fans parked trucks around the depot rather than stacking them", async () => {
    const snap = await load(
      board({ drivers: [driver({ depot_latitude: -7.33, depot_longitude: 110.5 })] }),
    );
    // Index 0 of 1 driver: angle is 0, so sin=0, cos=1 -- lng shifts, lat does not.
    expect(snap.assignments[0].driverCoord.lat).toBeCloseTo(-7.33, 5);
    expect(snap.assignments[0].driverCoord.lng).toBeCloseTo(110.506, 2);
  });

  it("omits a driver with no stops in the range from the map", async () => {
    const snap = await load(board({ drivers: [driver({ driver_id: "solo" })], stops: [] }));
    expect(snap.assignments).toHaveLength(0);
  });
});

describe("filing against a stop from the desk", () => {
  it("departs every open, not-yet-departed document", async () => {
    const snap = await load(
      board({
        stops: [
          stop({
            deliveries: [
              delivery(),
              delivery({ id: D2, delivery_number: "SJ-SLT-20260906-0002", dispatched_qty: 20 }),
            ],
          }),
        ],
      }),
    );

    await monitoringApiHttp.setDeliveryStatus({ deliveryId: snap.rows[0].id, status: "Proses" });

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, "post", `/deliveries/${D1}/depart`, { version: 1 });
    expect(send).toHaveBeenNthCalledWith(2, "post", `/deliveries/${D2}/depart`, { version: 1 });
  });

  it("skips a document that has already departed rather than refiling it", async () => {
    const snap = await load(
      board({
        stops: [
          stop({
            deliveries: [
              delivery({ delivery_status: "on_route" }),
              delivery({ id: D2, delivery_number: "SJ-SLT-20260906-0002", dispatched_qty: 20 }),
            ],
          }),
        ],
      }),
    );

    await monitoringApiHttp.setDeliveryStatus({ deliveryId: snap.rows[0].id, status: "Proses" });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("post", `/deliveries/${D2}/depart`, { version: 1 });
  });

  it("never files a position for a desk write", async () => {
    const snap = await load();
    await monitoringApiHttp.setDeliveryStatus({ deliveryId: snap.rows[0].id, status: "Proses" });
    const body = send.mock.calls[0][2] as Record<string, unknown>;
    expect(body).not.toHaveProperty("latitude");
    expect(body).not.toHaveProperty("longitude");
  });

  it("splits a shortfall across documents and files the remainder as returned", async () => {
    const snap = await load(
      board({
        stops: [
          stop({
            deliveries: [
              delivery({ dispatched_qty: 50 }),
              delivery({ id: D2, delivery_number: "SJ-SLT-20260906-0002", dispatched_qty: 20 }),
            ],
          }),
        ],
      }),
    );

    const result = await monitoringApiHttp.setDeliveryStatus({
      deliveryId: snap.rows[0].id,
      status: "Selesai",
      realisasi: 60,
      diterimaOleh: "  Bu Sri ",
    });

    // 50 goes to the first document in full, the remaining 10 to the second.
    // Both carry who took them: the service refuses a drop with nobody named.
    expect(send).toHaveBeenNthCalledWith(1, "post", `/deliveries/${D1}/complete`, {
      version: 1,
      delivered_qty: 50,
      returned_qty: 0,
      empties_collected: 0,
      recipient_name: "Bu Sri",
    });
    expect(send).toHaveBeenNthCalledWith(2, "post", `/deliveries/${D2}/complete`, {
      version: 1,
      delivered_qty: 10,
      returned_qty: 10,
      empties_collected: 0,
      recipient_name: "Bu Sri",
    });
    expect(result.realisasi).toBe(60);
  });

  it("closes a stop the driver already half-settled without refiling the settled document", async () => {
    const snap = await load(
      board({
        stops: [
          stop({
            deliveries: [
              delivery({ delivery_status: "delivered", delivered_qty: 50 }),
              delivery({ id: D2, delivery_number: "SJ-SLT-20260906-0002", dispatched_qty: 20 }),
            ],
          }),
        ],
      }),
    );

    await monitoringApiHttp.setDeliveryStatus({
      deliveryId: snap.rows[0].id,
      status: "Selesai",
      realisasi: 20,
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("post", `/deliveries/${D2}/complete`, {
      version: 1,
      delivered_qty: 20,
      returned_qty: 0,
      empties_collected: 0,
    });
  });

  it("refuses to mark a stop tertunda without a reason", async () => {
    const snap = await load();
    await expect(
      monitoringApiHttp.setDeliveryStatus({ deliveryId: snap.rows[0].id, status: "Tertunda" }),
    ).rejects.toThrow();
    expect(send).not.toHaveBeenCalled();
  });

  it("files every open document as failed with the given reason", async () => {
    const snap = await load();
    await monitoringApiHttp.setDeliveryStatus({
      deliveryId: snap.rows[0].id,
      status: "Tertunda",
      catatan: "Pangkalan tutup",
    });
    expect(send).toHaveBeenCalledWith("post", `/deliveries/${D1}/fail`, {
      version: 1,
      failure_reason: "Pangkalan tutup",
    });
  });

  it("refuses to file against a stop the board has not loaded", async () => {
    await expect(
      monitoringApiHttp.setDeliveryStatus({ deliveryId: "not-loaded", status: "Proses" }),
    ).rejects.toThrow();
  });
});

describe("printing a surat jalan", () => {
  it("reads the letterhead from settings and prints without a second board request", async () => {
    const snap = await load();
    const { printDocument } = await import("@/lib/export");
    await monitoringApiHttp.printSuratJalan(snap.rows[0].id);

    expect(getSettings).toHaveBeenCalledTimes(1);
    expect(getOne).toHaveBeenCalledTimes(1); // only the original board fetch
    expect(printDocument).toHaveBeenCalledWith(
      expect.stringContaining("SJ-SLT-20260906-0001"),
      expect.stringContaining("PT Bimbo Salatiga"),
    );
  });

  it("refuses to print a row the board has not loaded", async () => {
    await expect(monitoringApiHttp.printSuratJalan("not-loaded")).rejects.toThrow();
  });
});

describe("closing a run", () => {
  // A driver on two runs has one card but two runs, and each is closed on
  // its own. A run cancelled with its plan is not offered at all (Round 1 N9).
  it("lists each run with its own surat jalan, and leaves a cancelled run out", async () => {
    const snap = await load(
      board({
        drivers: [
          driver({ trip_id: "trip-1", trip_no: 1, departed_at: "2026-09-06T00:10:00Z", returned_at: "2026-09-06T04:00:00Z" }),
          driver({ trip_id: "trip-2", trip_no: 2, departed_at: "2026-09-06T05:00:00Z" }),
          driver({ trip_id: "trip-3", trip_no: 3, trip_status: "cancelled" }),
        ],
        stops: [
          stop({
            trip_id: "trip-1",
            deliveries: [
              delivery({
                delivery_status: "partial", delivered_qty: 40, returned_qty: 10,
                reconciled: true, return_pending: true,
              }),
            ],
          }),
          stop({
            stop_id: "stop-2",
            trip_id: "trip-2",
            deliveries: [delivery({ id: D2, delivery_number: "SJ-2", delivery_status: "on_route" })],
          }),
        ],
      }),
    );
    expect(snap.runs.map((r) => [r.ritKe, r.bisaDitutup])).toEqual([
      [1, false],
      [2, true],
    ]);
    expect(snap.runs[0].dokumen[0]).toMatchObject({
      diterima: 40, kembali: 10, status: "Selesai", dikonfirmasi: true, koreksiTertunda: true,
    });
    expect(snap.runs[1].dokumen.map((d) => [d.kode, d.status])).toEqual([["SJ-2", "Proses"]]);
  });

  it("sends only the corrected counts, and none at all for an unedited close", async () => {
    send.mockResolvedValue({ trip_id: "trip-1", stops: [], plan_completed: false });

    await monitoringApiHttp.closeRun({ runId: "trip-1", koreksi: [] });
    expect(send).toHaveBeenLastCalledWith("post", "/distribution/trips/trip-1/close", {}, { timeout: 60_000 });

    await monitoringApiHttp.closeRun({
      runId: "trip-1",
      koreksi: [{ deliveryId: D1, diterima: 45, kembali: 5, catatan: "salah ketik" }],
    });
    expect(send).toHaveBeenLastCalledWith(
      "post",
      "/distribution/trips/trip-1/close",
      { counts: [{ delivery_id: D1, delivered_qty: 45, returned_qty: 5, note: "salah ketik" }] },
      { timeout: 60_000 },
    );
  });

  it("reports a stop whose books correction failed as pending, with the reason", async () => {
    send.mockResolvedValue({
      trip_id: "trip-1",
      plan_completed: true,
      stops: [
        {
          delivery_id: D1, delivery_number: "SJ-1", outlet_name: "Pangkalan Melati",
          delivered_qty: 0, returned_qty: 30, corrected: false,
          credit_amount: 0, released_to_deposit: 0,
          books_pending: true, books_error: "Periode ini sudah ditutup",
        },
      ],
    });
    const result = await monitoringApiHttp.closeRun({ runId: "trip-1", koreksi: [] });
    expect(result.rencanaSelesai).toBe(true);
    expect(result.dokumen[0]).toMatchObject({ tertunda: true, alasan: "Periode ini sudah ditutup", kembali: 30 });
  });
});

describe("kirim ulang", () => {
  it("posts the surat jalan and the day, and reports the plan it landed on", async () => {
    send.mockResolvedValue({
      plan_id: "plan-9", plan_number: "RD-SLT-20261118-0003",
      planned_delivery_date: "2026-11-18", quantity: 40, plan_opened: true,
    });
    const result = await monitoringApiHttp.redeliver({ deliveryId: D1, tanggal: "2026-11-18" });
    expect(send).toHaveBeenLastCalledWith("post", `/distribution/redeliveries/${D1}`, {
      planned_delivery_date: "2026-11-18",
    });
    expect(result).toEqual({
      rencanaId: "plan-9", rencana: "RD-SLT-20261118-0003", tanggal: "2026-11-18", jumlah: 40, rencanaBaru: true,
    });
  });

  it("marks a surat jalan already rescheduled", async () => {
    const snap = await load(
      board({
        drivers: [driver({ trip_id: "trip-1", trip_no: 1, departed_at: "2026-09-06T00:10:00Z", returned_at: "2026-09-06T04:00:00Z" })],
        stops: [stop({ deliveries: [delivery({
          delivery_status: "failed", returned_qty: 50, reconciled: true,
          return_credit_note_number: "CN-1", redelivery_plan: "RD-SLT-20260907-0001 · 07/09/2026",
        })] })],
      }),
    );
    expect(snap.runs[0].dokumen[0].kirimUlang).toBe("RD-SLT-20260907-0001 · 07/09/2026");
  });
});
