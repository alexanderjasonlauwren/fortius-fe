import { expect, it, vi, beforeEach, describe } from "vitest";

/**
 * The driver's run, and the translation the split leaves this adapter holding.
 *
 * The service issues one surat jalan per product; the driver parks once. The
 * read side of that is grouped by the server, but the write side is here — one
 * call per document, filed from one press of one button. These pin that
 * fan-out, because getting it wrong does not throw: it closes some documents
 * and leaves others open, and the stop looks finished on the phone while the
 * office still has work outstanding against it.
 */

const getOne = vi.fn();
const send = vi.fn();
/** Each filing's send options: its Idempotency-Key and content type. */
const sentOptions: { idempotencyKey?: string; contentType?: string }[] = [];

// Filings go through the outbox, which sends each one as an encoded body with
// an Idempotency-Key. The mock decodes a JSON body back into the object these
// tests assert, and keeps the options to the side.
vi.mock("@/lib/api", async (importOriginal) => ({
  ApiError: (await importOriginal<typeof import("@/lib/api")>()).ApiError,
  getList: vi.fn(),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (method: string, path: string, body: unknown, options?: { idempotencyKey?: string; contentType?: string }) => {
    sentOptions.push(options ?? {});
    const decoded = typeof body === "string" ? JSON.parse(body) : body;
    return send(method, path, decoded);
  },
  upload: vi.fn(),
}));
// jsdom has no canvas; the photo goes up as given.
vi.mock("@/lib/image", () => ({ downscaleImage: async (file: File) => file }));

vi.mock("@/lib/geo", () => ({
  capturePosition: async () => ({ lat: -6.9932, lng: 110.3453, status: "ok" }),
  geoVerdict: () => "sesuai",
}));

const { sopirApiHttp } = await import("./sopirApi.http");
const { ApiError } = await import("@/lib/api");

const D3 = "aaaaaaaa-1111-4111-8111-111111111111";
const D12 = "bbbbbbbb-2222-4222-8222-222222222222";
const P3 = "cccccccc-3333-4333-8333-333333333333";
const P12 = "dddddddd-4444-4444-8444-444444444444";

function delivery(overrides: Record<string, unknown> = {}) {
  return {
    id: D3,
    delivery_number: "SJ-SLT-20260904-0002",
    product_id: P3,
    product_name: "LPG 3 Kg Subsidi",
    dispatched_qty: 50,
    delivered_qty: 0,
    returned_qty: 0,
    empties_collected: 0,
    delivery_status: "pending",
    version: 1,
    ...overrides,
  };
}

/** One outlet, two cylinder sizes, one visit. */
function run(overrides: Record<string, unknown> = {}) {
  return {
    date: "2026-09-04",
    driver_id: "eeeeeeee-5555-4555-8555-555555555555",
    driver_name: "Slamet",
    plate: "H 1234 AB",
    stops: [
      {
        sequence_no: 1,
        outlet_id: "ffffffff-6666-4666-8666-666666666666",
        outlet_code: "PGKL-0001",
        outlet_name: "Pangkalan Melati",
        owner_name: "Bu Sri",
        phone: "081234567890",
        address: "Jl. Melati No. 1",
        district: "Ngaliyan",
        latitude: -6.9932,
        longitude: 110.3453,
        deliveries: [
          delivery(),
          delivery({
            id: D12,
            delivery_number: "SJ-SLT-20260904-0003",
            product_id: P12,
            product_name: "LPG 12 Kg",
            dispatched_qty: 20,
            version: 4,
          }),
        ],
      },
    ],
    record_driver_location: true,
    ...overrides,
  };
}

beforeEach(async () => {
  getOne.mockReset();
  send.mockReset();
  sentOptions.length = 0;
  // The outbox is the module's; nothing a test left behind may queue the next.
  for (const f of await sopirApiHttp.pendingFilings()) await sopirApiHttp.discardFiling(f.id);
  // The server answers a filing with the updated document, and the row
  // versioning trigger has moved the counter on. Mocking that rather than an
  // empty object is what lets a completion assert the version it filed at.
  send.mockImplementation(async (_m: string, path: string, body: { version: number }) => ({
    version: path.includes("/arrive") ? body.version + 1 : body.version,
  }));
});

/** Draws the run, which is what the screen does before it offers any button. */
async function load(payload: Record<string, unknown> = run()) {
  getOne.mockImplementation(async (path: string) =>
    path.startsWith("/deliveries/mine")
      ? payload
      : { vehicle_type: "truck", capacity_qty: 240 },
  );
  return sopirApiHttp.getMyRun("ignored", "2026-09-04");
}

describe("reading the run", () => {
  // The driver's own account cannot read tenant settings, so the switch has
  // to arrive on the run itself -- hardcoding true here is exactly the bug
  // that shipped before this was wired up.
  it("reads the recording switch from the run rather than assuming it is on", async () => {
    const on = await load(run({ record_driver_location: true }));
    expect(on.rekamLokasi).toBe(true);

    const off = await load(run({ record_driver_location: false }));
    expect(off.rekamLokasi).toBe(false);
  });

  it("keeps a two-product drop as one stop the driver parks at once", async () => {
    const r = await load();

    expect(r.stops).toHaveLength(1);
    expect(r.stops[0].lines.map((l) => l.nama)).toEqual([
      "LPG 3 Kg Subsidi",
      "LPG 12 Kg",
    ]);
    expect(r.stops[0].target).toBe(70);
  });

  it("names every document the outlet signs for, not just the first", async () => {
    const r = await load();
    expect(r.stops[0].kode).toBe("SJ-SLT-20260904-0002, SJ-SLT-20260904-0003");
  });

  it("carries the address and the number the driver rings at the gate", async () => {
    const r = await load();
    expect(r.stops[0].alamat).toBe("Jl. Melati No. 1");
    expect(r.stops[0].telepon).toBe("081234567890");
    expect(r.stops[0].lat).toBeCloseTo(-6.9932);
  });

  it("does not ask the driver for a driver id: the run is the session", async () => {
    await load();
    const asked = getOne.mock.calls.map((c) => c[0] as string);
    expect(asked[0]).toBe("/deliveries/mine?date=2026-09-04");
    expect(asked[0]).not.toContain("driver");
  });

  it("reads the stage off the filings, not off a status set at dispatch", async () => {
    // Issued paperwork nobody has moved is queued, whatever the row says.
    expect((await load()).stops[0].status).toBe("Antrian");

    const departed = run();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (departed.stops[0].deliveries[0] as any).departed_at = "2026-09-04T01:00:00Z";
    expect((await load(departed)).stops[0].status).toBe("Proses");
  });

  it("still renders the route when the fleet read fails", async () => {
    getOne.mockImplementation(async (path: string) => {
      if (path.startsWith("/deliveries/mine")) return run();
      throw new Error("fleet is down");
    });
    const r = await sopirApiHttp.getMyRun("ignored", "2026-09-04");
    expect(r.stops).toHaveLength(1);
    expect(r.driver?.kapasitas).toBe(0);
  });
});

describe("arriving at a stop", () => {
  it("files one arrival per document, with the position and the version", async () => {
    const r = await load(
      run({
        stops: [
          {
            ...run().stops[0],
            deliveries: [
              delivery({ departed_at: "2026-09-04T01:00:00Z", delivery_status: "on_route" }),
              delivery({
                id: D12,
                delivery_number: "SJ-SLT-20260904-0003",
                product_id: P12,
                dispatched_qty: 20,
                version: 4,
                departed_at: "2026-09-04T01:00:00Z",
                delivery_status: "on_route",
              }),
            ],
          },
        ],
      }),
    );

    await sopirApiHttp.arriveStop(r.stops[0].id);

    expect(send).toHaveBeenCalledTimes(2);
    expect(send).toHaveBeenNthCalledWith(1, "post", `/deliveries/${D3}/arrive`, {
      version: 1,
      latitude: -6.9932,
      longitude: 110.3453,
    });
    expect(send).toHaveBeenNthCalledWith(2, "post", `/deliveries/${D12}/arrive`, {
      version: 4,
      latitude: -6.9932,
      longitude: 110.3453,
    });
  });

  // The service refuses a second arrival, and it is right to: the truck
  // arrived once. Refiling one would 409 and take the rest of the stop with
  // it, leaving a half-arrived stop the driver could never finish arriving at.
  it("skips a document that has already been marked as arrived", async () => {
    const r = await load(
      run({
        stops: [
          {
            ...run().stops[0],
            deliveries: [
              delivery({ arrived_at: "2026-09-04T02:00:00Z", delivery_status: "on_route" }),
              delivery({
                id: D12,
                delivery_number: "SJ-SLT-20260904-0003",
                product_id: P12,
                dispatched_qty: 20,
                version: 4,
                delivery_status: "on_route",
              }),
            ],
          },
        ],
      }),
    );

    await sopirApiHttp.arriveStop(r.stops[0].id);

    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith("post", `/deliveries/${D12}/arrive`, {
      version: 4,
      latitude: -6.9932,
      longitude: 110.3453,
    });
  });

  // The card decides which of the two buttons to offer from this, so a stop
  // that has been arrived at must say so — otherwise the driver is asked to
  // arrive again at a gate they are standing at.
  it("reports the earliest arrival on the stop, so the card offers the right button", async () => {
    const r = await load(
      run({
        stops: [
          {
            ...run().stops[0],
            deliveries: [
              delivery({ arrived_at: "2026-09-04T02:05:00Z" }),
              delivery({ id: D12, product_id: P12, arrived_at: "2026-09-04T02:00:00Z" }),
            ],
          },
        ],
      }),
    );

    expect(r.stops[0].tibaPada).toBe("2026-09-04T02:00:00Z");
  });

  // Departing is not arriving. A truck that has left the yard for this stop is
  // on the road, and inferring the arrival from the departure would hide the
  // travel time as well as the wait -- the two things splitting the button was
  // for.
  it("does not treat a departure as an arrival", async () => {
    const r = await load(
      run({
        stops: [
          {
            ...run().stops[0],
            deliveries: [
              delivery({ departed_at: "2026-09-04T01:00:00Z", delivery_status: "on_route" }),
            ],
          },
        ],
      }),
    );

    expect(r.stops[0].status).toBe("Proses");
    expect(r.stops[0].tibaPada).toBeUndefined();
  });
});

describe("showing a closed stop back to the driver", () => {
  // Someone whose filing is recorded should be able to see what was recorded
  // -- the same principle the position filings are shown under. Before the run
  // carried it back, the name went into core.delivery_proofs and vanished from
  // the driver's own card.
  it("shows who took the load, from the proof rather than from the note", async () => {
    const r = await load(
      run({
        stops: [
          {
            ...run().stops[0],
            deliveries: [
              delivery({
                completed_at: "2026-09-04T03:00:00Z",
                delivery_status: "delivered",
                recipient_name: "Pak Andi Wijaya",
                notes: "pangkalan minta dua rit",
              }),
            ],
          },
        ],
      }),
    );

    expect(r.stops[0].diterimaOleh).toBe("Pak Andi Wijaya");
    // A note is not a signature: it stays in `catatan` and does not become the
    // recipient just because no name came back.
    expect(r.stops[0].catatan).toBe("pangkalan minta dua rit");
  });

  it("leaves the recipient blank on a drop nobody named one for", async () => {
    const r = await load(
      run({
        stops: [
          {
            ...run().stops[0],
            deliveries: [delivery({ notes: "pangkalan minta dua rit" })],
          },
        ],
      }),
    );

    expect(r.stops[0].diterimaOleh).toBeUndefined();
  });
});

describe("filing against a stop", () => {
  it("closes every document on the stop, each at its own version", async () => {
    const r = await load();

    await sopirApiHttp.completeStop({
      deliveryId: r.stops[0].id,
      lines: [
        { productId: P3, realisasi: 48, kembali: 40 },
        { productId: P12, realisasi: 20 },
      ],
      diterimaOleh: "Bu Sri",
    });

    expect(send).toHaveBeenCalledTimes(2);
    const [, path3, body3] = send.mock.calls[0];
    const [, path12, body12] = send.mock.calls[1];

    expect(path3).toBe(`/deliveries/${D3}/complete`);
    expect(body3).toMatchObject({
      version: 1,
      delivered_qty: 48,
      // 50 left the yard and 48 were taken: the two the outlet refused are a
      // fact of their own, not a rounding of the total.
      returned_qty: 2,
      empties_collected: 40,
      recipient_name: "Bu Sri",
      latitude: -6.9932,
    });

    expect(path12).toBe(`/deliveries/${D12}/complete`);
    // The second document's version is its own, not the first one's.
    expect(body12).toMatchObject({ version: 4, delivered_qty: 20, returned_qty: 0 });
  });

  it("closes a document the driver did not touch at what it carried", async () => {
    const r = await load();

    await sopirApiHttp.completeStop({
      deliveryId: r.stops[0].id,
      lines: [{ productId: P3, realisasi: 50 }],
      diterimaOleh: "Bu Sri",
    });

    const [, , body12] = send.mock.calls[1];
    // Left open, the stop would read as finished on the phone while the office
    // still has a surat jalan outstanding against it.
    expect(body12).toMatchObject({ delivered_qty: 20, returned_qty: 0 });
  });

  it("files one call per document and lets the service stamp the arrival", async () => {
    const r = await load();

    await sopirApiHttp.completeStop({
      deliveryId: r.stops[0].id,
      lines: [{ productId: P3, realisasi: 50 }],
      diterimaOleh: "Bu Sri",
    });

    // Two documents, one write each. The service stamps arrived_at in the same
    // write when the driver never filed one, so a separate arrival call would
    // be a second round trip on a phone at a gate for nothing.
    expect(send.mock.calls.map((c) => c[1])).toEqual([
      `/deliveries/${D3}/complete`,
      `/deliveries/${D12}/complete`,
    ]);
  });

  it("holds every document on the stop, with the reason the service requires", async () => {
    const r = await load();

    await sopirApiHttp.holdStop({ deliveryId: r.stops[0].id, catatan: "Pangkalan tutup" });

    expect(send.mock.calls.map((c) => c[1])).toEqual([
      `/deliveries/${D3}/fail`,
      `/deliveries/${D12}/fail`,
    ]);
    expect(send.mock.calls[0][2]).toMatchObject({ failure_reason: "Pangkalan tutup" });
  });

  it("finishes a stop whose other document is already closed", async () => {
    const half = run();
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    (half.stops[0].deliveries[0] as any).completed_at = "2026-09-04T03:00:00Z";
    const r = await load(half);

    await sopirApiHttp.completeStop({
      deliveryId: r.stops[0].id,
      lines: [{ productId: P12, realisasi: 20 }],
      diterimaOleh: "Bu Sri",
    });

    // Only the open one. Filing against the settled half answers "already
    // partial" and takes the rest of the stop down with it.
    expect(send.mock.calls.map((c) => c[1])).toEqual([
      `/deliveries/${D12}/complete`,
    ]);
  });

  it("attaches the photo to the stop's first surat jalan after closing it", async () => {
    const r = await load();
    const calls: string[] = [];
    send.mockImplementation(async (_m: string, path: string) => calls.push(path));
    const foto = new File(["x"], "drop.jpg", { type: "image/jpeg" });

    const receipt = await sopirApiHttp.completeStop({
      deliveryId: r.stops[0].id,
      lines: [{ productId: P3, realisasi: 50 }],
      diterimaOleh: "Bu Sri",
      foto,
    });

    // After the completions: a photo is evidence of the drop, and must not be
    // the step that decides whether the drop is recorded.
    expect(calls).toEqual([
      `/deliveries/${D3}/complete`,
      `/deliveries/${D12}/complete`,
      `/attachments/delivery/${D3}`,
    ]);
    expect(sentOptions[2].contentType).toMatch(/^multipart\/form-data; boundary=/);
    expect(receipt.fotoGagal).toBeUndefined();
  });

  it("still closes the stop when the photo upload fails, and says so", async () => {
    const r = await load();
    send.mockImplementation(async (_m: string, path: string) => {
      if (path.startsWith("/attachments/")) {
        throw new ApiError({ message: "Foto bukti pengiriman harus berupa gambar", code: "VALIDATION_FAILED", status: 422 });
      }
      return undefined;
    });

    const receipt = await sopirApiHttp.completeStop({
      deliveryId: r.stops[0].id,
      lines: [{ productId: P3, realisasi: 50 }],
      diterimaOleh: "Bu Sri",
      foto: new File(["x"], "drop.heic", { type: "image/heic" }),
    });

    expect(send).toHaveBeenCalledTimes(3);
    expect(receipt.fotoGagal).toMatch(/harus berupa gambar/);
    // Refused, not queued: retrying the same bytes gets the same answer.
    expect(await sopirApiHttp.pendingFilings()).toHaveLength(0);
  });

  it("refuses to file against a stop it never loaded", async () => {
    await expect(sopirApiHttp.departStop("a-stop-from-nowhere")).rejects.toThrow(
      /Muat ulang/,
    );
    expect(send).not.toHaveBeenCalled();
  });
});

describe("filing with no signal", () => {
  const offline = () => new ApiError({ message: "Network Error", code: "NETWORK" });

  it("keeps a filing the network did not carry, and replays it once with the same key", async () => {
    const r = await load();
    send.mockRejectedValue(offline());

    const receipt = await sopirApiHttp.departStop(r.stops[0].id);
    expect(receipt.tertunda).toBe(true);
    const waiting = await sopirApiHttp.pendingFilings();
    expect(waiting.map((f) => [f.kind, f.documentId])).toEqual([
      ["depart", D3],
      ["depart", D12],
    ]);

    const firstKeys = sentOptions.map((o) => o.idempotencyKey);
    send.mockReset().mockImplementation(async (_m: string, _p: string, body: { version: number }) => ({ version: body.version + 1 }));
    sentOptions.length = 0;
    const result = await sopirApiHttp.replayFilings();

    expect(result).toEqual({ sent: 2, refused: 0, offline: false });
    // The first document's request left before the network gave out; its
    // replay carries the same key, so the server answers it from its record.
    expect(sentOptions[0].idempotencyKey).toBe(firstKeys[0]);
    expect(await sopirApiHttp.pendingFilings()).toHaveLength(0);
  });

  it("queues an arrival behind a departure that has not gone, and builds it on the departure's answer", async () => {
    const r = await load();
    send.mockRejectedValue(offline());
    await sopirApiHttp.departStop(r.stops[0].id);
    const arrival = await sopirApiHttp.arriveStop(r.stops[0].id);
    expect(arrival.tertunda).toBe(true);
    const arrivals = (await sopirApiHttp.pendingFilings()).filter((f) => f.kind === "arrive");
    expect(arrivals.every((f) => f.sent === undefined)).toBe(true);

    send.mockReset().mockImplementation(async (_m: string, _p: string, body: { version: number }) => ({ version: body.version + 1 }));
    await sopirApiHttp.replayFilings();

    const d3 = send.mock.calls.filter((c) => c[1].startsWith(`/deliveries/${D3}/`));
    expect(d3.map((c) => [c[1].split("/").pop(), c[2].version])).toEqual([
      ["depart", 1],
      ["arrive", 2],
    ]);
  });

  it("files a second tap of the same button once", async () => {
    const r = await load();
    send.mockRejectedValue(offline());
    await sopirApiHttp.departStop(r.stops[0].id);
    await sopirApiHttp.departStop(r.stops[0].id);
    expect((await sopirApiHttp.pendingFilings()).filter((f) => f.kind === "depart")).toHaveLength(2);
  });

  it("gives every filing its own key, so a retry is recognised and a new filing is not", async () => {
    const r = await load();
    await sopirApiHttp.arriveStop(r.stops[0].id);
    const keys = sentOptions.map((o) => o.idempotencyKey);
    expect(keys).toHaveLength(2);
    expect(new Set(keys).size).toBe(2);
    expect(keys.every((k) => typeof k === "string" && k.length > 0)).toBe(true);
  });
});
