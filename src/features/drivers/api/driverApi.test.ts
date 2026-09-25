import { expect, it, vi, beforeEach, describe } from "vitest";

/**
 * The driver adapter, and the model split it enforces.
 *
 * The one assertion here that is worth more than the rest is the negative one:
 * a driver carries no truck. `core.drivers` and `core.vehicles` have no link
 * column, the pairing lives on `core.dispatch_trips`, and the console used to
 * collapse the two by putting the plate on the driver — which made "what is
 * this driver's capacity?" answerable and wrong on any day they took a
 * different truck.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));
vi.mock("@/lib/export", () => ({ exportCsv: vi.fn(), timestampSuffix: () => "x" }));

const { driverApiHttp, getDriverSchedule } = await import("./driverApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    branch_id: "22222222-2222-4222-8222-222222222222",
    code: "DRV-001",
    full_name: "Slamet Riyadi",
    phone: "081234567890",
    sim_number: "B1234567",
    sim_type: "B2",
    performance_score: 90,
    rating: 4.5,
    total_deliveries: 120,
    on_time_deliveries: 110,
    employment_status: "active",
    status: "atv",
    version: 2,
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
 * The split, asserted as an absence.
 *
 * A test for something not being there looks odd until you remember what it
 * replaces: three fields that made every screen able to ask a question with no
 * answer. If a plate reappears on this object, the model has quietly
 * recollapsed and every capacity check built on it is wrong again.
 */
it("carries no plate, no vehicle and no capacity", async () => {
  getOne.mockResolvedValue(wire());

  const driver = (await driverApiHttp.getDriverDetail(ID)) as unknown as Record<string, unknown>;

  expect(driver).not.toHaveProperty("plat");
  expect(driver).not.toHaveProperty("armada");
  expect(driver).not.toHaveProperty("kapasitas");
});

/** And the write must not send them either: the request types do not declare
 * them, and binding refuses an unrecognised field rather than dropping it. */
it("never sends a plate or a capacity", async () => {
  send.mockResolvedValue(wire());

  await driverApiHttp.createOrUpdateDriver({
    nama: "Baru",
    telepon: "081234567890",
  } as never);

  const body = send.mock.calls[0][2];
  expect(Object.keys(body)).not.toContain("plate_number");
  expect(Object.keys(body)).not.toContain("capacity_qty");
});

/**
 * Only `Cuti` is a fact about employment.
 *
 * The console's other four words — Standby, Dalam Perjalanan, Bongkar Muat,
 * Selesai — describe where a driver is on a run, which the dispatch board knows
 * and this endpoint does not. Everyone available maps to Standby rather than to
 * a position this list cannot see.
 */
it("maps only leave onto a status this endpoint can know", async () => {
  getOne.mockResolvedValue(wire({ employment_status: "on_leave" }));
  expect((await driverApiHttp.getDriverDetail(ID)).status).toBe("Cuti");

  getOne.mockResolvedValue(wire({ employment_status: "active" }));
  expect((await driverApiHttp.getDriverDetail(ID)).status).toBe("Standby");
});

/**
 * The delivery-derived figures are flagged, not fabricated. "0 pengiriman,
 * ketepatan 100%" describes a driver who has done nothing perfectly.
 */
it("marks the delivery-derived figures unavailable", async () => {
  getOne.mockResolvedValue(wire());

  const driver = await driverApiHttp.getDriverDetail(ID);

  expect(driver.statistikTersedia).toBe(false);
  expect(driver.pengiriman30Hari).toBe(0);
  expect(driver.ketepatan).toBe(0);
});

describe("getDriverSchedule", () => {
  /** Today's stops for this one driver -- not the whole fleet's, and not
   *  yesterday's. */
  it("filters by driver and today's date", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });

    await getDriverSchedule(ID);

    const [path, params] = getList.mock.calls[0];
    expect(path).toBe("/deliveries");
    const fields = params.filters.map((f: { field: string }) => f.field);
    expect(fields).toEqual(["driver_id", "date", "date"]);
    expect(params.filters[0]).toEqual({ field: "driver_id", operator: "eq", value: ID });
  });

  /** The real five-state lifecycle folds onto the console's four words. */
  it("maps the real delivery lifecycle onto the console's four words", async () => {
    getList.mockResolvedValue({
      items: [
        { id: "1", delivery_number: "SJ-1", dispatched_qty: 10, delivered_qty: 10, delivery_status: "delivered" },
        { id: "2", delivery_number: "SJ-2", dispatched_qty: 10, delivered_qty: 0, delivery_status: "on_route" },
        { id: "3", delivery_number: "SJ-3", dispatched_qty: 10, delivered_qty: 0, delivery_status: "failed" },
        { id: "4", delivery_number: "SJ-4", dispatched_qty: 10, delivered_qty: 0, delivery_status: "pending" },
      ],
      pagination: {},
    });

    const rows = await getDriverSchedule(ID);

    expect(rows.map((r) => r.status)).toEqual(["Selesai", "Proses", "Tertunda", "Antrian"]);
  });
});

describe("writing", () => {
  it("reads the version before updating and sends it back", async () => {
    getOne.mockResolvedValue(wire({ version: 5 }));
    send.mockResolvedValue(wire({ version: 6 }));

    await driverApiHttp.createOrUpdateDriver({ id: ID, nama: "Slamet R." });

    const [method, , body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(body.version).toBe(5);
    expect(body.full_name).toBe("Slamet R.");
  });

  /** The list only ever shows live drivers; the soft-delete flag is not a
   * filter the user chooses. */
  it("always excludes soft-deleted rows", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });
    await driverApiHttp.getDrivers();
    expect(getList.mock.calls[0][1].filters).toContainEqual({
      field: "status",
      operator: "eq",
      value: "atv",
    });
  });

  /**
   * The gap this whole change closes: a driver is always a person, and a
   * person here is always a user, so registering one must provision the login
   * in the same request rather than leaving it to be wired up separately.
   */
  it("provisions a login alongside a new driver", async () => {
    send.mockResolvedValue(wire());

    await driverApiHttp.createOrUpdateDriver({
      kode: "DRV-002",
      nama: "Baru",
      telepon: "081234567890",
      akunUsername: "  baru_driver  ",
      akunEmail: "  baru@sidistrib.id  ",
      akunPassword: "Str0ng!Passw0rd",
    });

    const body = send.mock.calls[0][2];
    expect(body.account).toEqual({
      username: "baru_driver",
      email: "baru@sidistrib.id",
      password: "Str0ng!Passw0rd",
    });
  });

  /** An existing driver's login is managed from the Users page. Re-sending
   * account fields on an update must not ask the service to provision a
   * second one. */
  it("never sends an account on update", async () => {
    getOne.mockResolvedValue(wire({ version: 5 }));
    send.mockResolvedValue(wire({ version: 6 }));

    await driverApiHttp.createOrUpdateDriver({
      id: ID,
      nama: "Slamet R.",
      akunUsername: "should_be_ignored",
      akunPassword: "Str0ng!Passw0rd",
    });

    const body = send.mock.calls[0][2];
    expect(body).not.toHaveProperty("account");
  });

  /** An account is optional: bulk-imported drivers legitimately have no login
   * yet, and this must not invent one from an empty username. */
  it("omits the account entirely when no username is given", async () => {
    send.mockResolvedValue(wire());

    await driverApiHttp.createOrUpdateDriver({
      kode: "DRV-003",
      nama: "Tanpa Akun",
      telepon: "081234567890",
    });

    const body = send.mock.calls[0][2];
    expect(body).not.toHaveProperty("account");
  });
});

/** The account, once linked, must round-trip back onto the domain object --
 * otherwise the console has no way to tell a driver already has a login from
 * one that does not. */
it("carries the linked user id", async () => {
  getOne.mockResolvedValue(wire({ user_id: "33333333-3333-4333-8333-333333333333" }));

  const driver = await driverApiHttp.getDriverDetail(ID);

  expect(driver.userId).toBe("33333333-3333-4333-8333-333333333333");
});
