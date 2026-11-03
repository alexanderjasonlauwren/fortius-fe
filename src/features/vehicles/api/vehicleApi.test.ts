import { expect, it, vi, beforeEach, describe } from "vitest";

/**
 * The fleet's mapping, and the model split it completes.
 *
 * The console had no vehicles at all before this: a plate and a capacity sat on
 * the driver, so "what is this driver's capacity?" was answerable and the
 * answer was wrong on any day they took a different truck. These assert the
 * half that was missing.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  // getAllPages walks pages through getList; one mocked call is one page.
  getAllPages: async (...args: unknown[]) => ({ items: (await getList(...args)).items, truncated: false }),
  getPage: async (path: string, params: { page?: number; pageSize?: number }, map: (row: unknown) => unknown) => {
    const result = await getList(path, params);
    return {
      items: result.items.map(map), page: params.page ?? 1, pageSize: params.pageSize ?? 50,
      hasNext: Boolean(result.pagination?.has_next), totalItems: result.pagination?.total_items,
    };
  },
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const { vehicleApiHttp } = await import("./vehicleApi.http");

const ID = "11111111-1111-4111-8111-111111111111";
const DAY = 24 * 60 * 60 * 1000;

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    branch_id: "22222222-2222-4222-8222-222222222222",
    plate_number: "H 1234 AB",
    vehicle_type: "truck",
    brand: "Isuzu",
    model: "Elf NMR",
    capacity_qty: 240,
    operational_status: "available",
    status: "atv",
    version: 1,
    created_at: "2026-01-05T02:00:00Z",
    updated_at: "2026-08-30T02:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
});

/**
 * Capacity in units is always present; in kilograms it may not be.
 *
 * `capacity_qty` is NOT NULL and `capacity_kg` is not, and that is
 * configuration rather than a missing field: "unknown weight limit, check the
 * count only" is a real answer for a truck nobody has weighed. Defaulting the
 * weight to zero would tell a planner the truck can carry nothing.
 */
it("keeps the weight limit absent when the service has none", async () => {
  getOne.mockResolvedValue(wire());
  const v = await vehicleApiHttp.getVehicleDetail(ID);
  expect(v.kapasitas).toBe(240);
  expect(v.kapasitasKg).toBeUndefined();

  getOne.mockResolvedValue(wire({ capacity_kg: 3600 }));
  expect((await vehicleApiHttp.getVehicleDetail(ID)).kapasitasKg).toBe(3600);
});

/**
 * A truck in the workshop reads as Perawatan whatever its audit flag says.
 *
 * `operational_status` is the truck's own lifecycle and `status` is the
 * three-letter soft-delete flag; the console shows one word. Folding them the
 * other way round would show an active truck the depot cannot actually send
 * out, which is the state a planner most needs to see.
 */
it("shows maintenance ahead of the audit flag", async () => {
  getOne.mockResolvedValue(wire({ operational_status: "maintenance", status: "atv" }));
  expect((await vehicleApiHttp.getVehicleDetail(ID)).status).toBe("Perawatan");

  getOne.mockResolvedValue(wire({ operational_status: "available", status: "ina" }));
  expect((await vehicleApiHttp.getVehicleDetail(ID)).status).toBe("Nonaktif");
});

/**
 * Make and model are one phrase on screen and two columns on the wire. A truck
 * with neither recorded falls back to its type rather than showing an empty
 * cell, because a row with a plate and no description reads as broken data.
 */
it("builds the fleet description from make and model, falling back to the type", async () => {
  getOne.mockResolvedValue(wire());
  expect((await vehicleApiHttp.getVehicleDetail(ID)).armada).toBe("Isuzu Elf NMR");

  getOne.mockResolvedValue(wire({ brand: undefined, model: undefined }));
  expect((await vehicleApiHttp.getVehicleDetail(ID)).armada).toBe("truck");
});

/**
 * The expiry flag uses the same rule in both builds.
 *
 * STNK and KIR are what make a truck legal to run, and "lapses within 30 days"
 * is the notice a workshop booking needs. The HTTP adapter reuses the mock's
 * decoration rather than restating the window, so the two cannot drift into
 * flagging different trucks.
 */
it("flags a certificate that has lapsed or lapses within 30 days", async () => {
  const soon = new Date(Date.now() + 10 * DAY).toISOString();
  const later = new Date(Date.now() + 200 * DAY).toISOString();

  getOne.mockResolvedValue(wire({ stnk_expires_at: soon, kir_expires_at: later }));
  expect((await vehicleApiHttp.getVehicleDetail(ID)).perluPerhatian).toBe(true);

  getOne.mockResolvedValue(wire({ stnk_expires_at: later, kir_expires_at: later }));
  expect((await vehicleApiHttp.getVehicleDetail(ID)).perluPerhatian).toBe(false);
});

describe("writing", () => {
  it("reads the version before updating and sends it back", async () => {
    getOne.mockResolvedValue(wire({ version: 6 }));
    send.mockResolvedValue(wire({ version: 7 }));

    await vehicleApiHttp.createOrUpdateVehicle({ id: ID, kapasitas: 300 });

    const [method, , body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(body.version).toBe(6);
    expect(body.capacity_qty).toBe(300);
  });

  /**
   * The fleet description is sent, and round-trips to the same phrase.
   *
   * It was dropped on the first live create: the form collected "Isuzu Elf NMR"
   * and the row came back reading "truck", because the payload carried no make
   * at all and toView fell back to the vehicle type.
   */
  it("sends the fleet description and reads it back whole", async () => {
    send.mockResolvedValue(wire({ brand: "Isuzu Elf NMR", model: undefined }));

    const saved = await vehicleApiHttp.createOrUpdateVehicle({
      plat: "H 9999 ZZ",
      armada: "Isuzu Elf NMR",
      kapasitas: 240,
    });

    expect(send.mock.calls[0][2].brand).toBe("Isuzu Elf NMR");
    expect(saved.armada).toBe("Isuzu Elf NMR");
  });

  it("posts a create without a version", async () => {
    send.mockResolvedValue(wire());
    await vehicleApiHttp.createOrUpdateVehicle({ plat: "H 9999 ZZ", kapasitas: 240 });

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/vehicles");
    expect(body.version).toBeUndefined();
    expect(getOne).not.toHaveBeenCalled();
  });

  /** The list only ever shows live trucks; the soft-delete flag is not a filter
   * the user chooses. */
  it("always excludes soft-deleted rows", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });
    await vehicleApiHttp.getVehicles();
    expect(getList.mock.calls[0][1].filters).toContainEqual({
      field: "status",
      operator: "eq",
      value: "atv",
    });
  });
});
