import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping, which is where the two sources drift.
 *
 * Three things are asserted here that no screen would reveal until a number was
 * wrong: the coordinate pair keeps its order, the delivery-derived figures are
 * flagged unavailable rather than reported as zero, and the write payload
 * carries only what the service accepts.
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

const { outletApiHttp, getOutletHistory } = await import("./outletApi.http");

const ID = "11111111-1111-4111-8111-111111111111";

function wire(overrides: Record<string, unknown> = {}) {
  return {
    id: ID,
    branch_id: "22222222-2222-4222-8222-222222222222",
    code: "PKL-001",
    name: "Pangkalan Ahmad",
    owner_name: "Ahmad Subarjo",
    phone: "081234567890",
    address: "Jl. Merdeka 12",
    district: "Sidorejo",
    city: "Salatiga",
    province: "Jawa Tengah",
    latitude: -7.3305,
    longitude: 110.5084,
    credit_limit: 5_000_000,
    credit_balance: 1_250_000,
    payment_terms_days: 14,
    auto_block_on_overdue: true,
    current_month_target_qty: 420,
    service_tier: "standard",
    status: "atv",
    version: 3,
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
 * The coordinate pair survives the mapping, in the right order.
 *
 * `ST_MakePoint` takes longitude first and every mapping API says "lat, lng",
 * so a swap is one keystroke and reads correctly in both files. Salatiga at
 * 7.33S 110.51E becomes a point in the Indian Ocean off Somalia if they trade
 * places — which looks like a data-entry mistake rather than a mapping bug, so
 * it is asserted here where the confusion actually lives.
 */
it("keeps latitude and longitude the right way round", async () => {
  getOne.mockResolvedValue(wire());

  const outlet = await outletApiHttp.getOutletDetail(ID);

  expect(outlet.lat).toBe(-7.3305);
  expect(outlet.lng).toBe(110.5084);
});

/**
 * The delivery-derived figures are flagged, not fabricated.
 *
 * Reported as zero without the flag, "0 tagihan tertunda" says this outlet owes
 * nothing and "sisa kuota 0" says it may take no more cylinders. Both are
 * claims a planner acts on, and neither is one this build can make.
 */
it("marks the delivery-derived figures unavailable", async () => {
  getOne.mockResolvedValue(wire());

  const outlet = await outletApiHttp.getOutletDetail(ID);

  expect(outlet.statistikTersedia).toBe(false);
  expect(outlet.terpakaiBulanIni).toBe(0);
  expect(outlet.tagihanTertunda).toBe(0);
  expect(outlet.pengirimanTerakhir).toBeUndefined();
});

/**
 * What the outlet owes IS known, because it is a column on the outlet rather
 * than a sum over invoices. Blanking it with the rest would throw away the one
 * credit figure the service can answer.
 */
it("still reports the credit balance", async () => {
  getOne.mockResolvedValue(wire());

  expect((await outletApiHttp.getOutletDetail(ID)).nilaiTertunda).toBe(1_250_000);
});

/** The monthly obligation comes from outlet targets, joined onto the read. */
it("maps the current month's target onto the monthly quota", async () => {
  getOne.mockResolvedValue(wire());

  expect((await outletApiHttp.getOutletDetail(ID)).kuotaBulanan).toBe(420);
});

/**
 * The expected receiving account -- what a payment recorded for this outlet
 * defaults to. Absent is a real state (an outlet whose account is not on
 * file yet), not an error, so both fields must round-trip as undefined
 * rather than empty strings that would render as a blank-looking value.
 */
it("maps the outlet's default bank and account number", async () => {
  getOne.mockResolvedValue(wire({ bank_name: "BNI", bank_account_number: "1234567890" }));

  const outlet = await outletApiHttp.getOutletDetail(ID);

  expect(outlet.bank).toBe("BNI");
  expect(outlet.noRekening).toBe("1234567890");
});

it("leaves bank and account number undefined when the outlet has none on file", async () => {
  getOne.mockResolvedValue(wire());

  const outlet = await outletApiHttp.getOutletDetail(ID);

  expect(outlet.bank).toBeUndefined();
  expect(outlet.noRekening).toBeUndefined();
});

describe("filtering", () => {
  /**
   * Filters go to the server, not to the array.
   *
   * A page is 100 rows. Filtered here, a search would look at one page of a
   * longer list and report that the rest do not match — an empty result that
   * reads as "no such outlet" rather than as "not on this page".
   */
  it("sends search, status and district to the server", async () => {
    getList.mockResolvedValue({ items: [wire()], pagination: {} });

    await outletApiHttp.getOutletList({
      search: "ahmad",
      status: "Aktif",
      kecamatan: "Sidorejo",
    });

    const [, params] = getList.mock.calls[0];
    expect(params.search).toBe("ahmad");
    expect(params.filters).toEqual([
      { field: "status", operator: "eq", value: "atv" },
      { field: "district", operator: "eq", value: "Sidorejo" },
    ]);
  });

  /** "Semua" is the absence of a filter, not a value to send. */
  it("sends no filter for Semua", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });

    await outletApiHttp.getOutletList({ status: "Semua", kecamatan: "Semua" });

    expect(getList.mock.calls[0][1].filters).toEqual([]);
  });
});

describe("getOutletHistory", () => {
  /** The history is this outlet's own deliveries, newest first, capped at the
   *  caller's limit -- not filtered client-side out of a bigger page. */
  it("filters by outlet, sorts newest first and caps at the limit", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });

    await getOutletHistory(ID, 5);

    const [path, params] = getList.mock.calls[0];
    expect(path).toBe("/deliveries");
    expect(params.pageSize).toBe(5);
    expect(params.sort).toEqual([{ field: "created_at", direction: "desc" }]);
    expect(params.filters).toEqual([{ field: "outlet_id", operator: "eq", value: ID }]);
  });

  /** The real five-state lifecycle folds onto the console's four words --
   *  `delivered`/`partial` read as done, `failed` as stuck, `on_route` as
   *  under way, and anything else (pending, cancelled) as still queued. */
  it("maps the real delivery lifecycle onto the console's four words", async () => {
    getList.mockResolvedValue({
      items: [
        { id: "1", delivery_number: "SJ-1", dispatched_qty: 10, delivered_qty: 10, delivery_status: "delivered", created_at: "2026-09-01T00:00:00Z" },
        { id: "2", delivery_number: "SJ-2", dispatched_qty: 10, delivered_qty: 5, delivery_status: "partial", created_at: "2026-09-02T00:00:00Z" },
        { id: "3", delivery_number: "SJ-3", dispatched_qty: 10, delivered_qty: 0, delivery_status: "on_route", created_at: "2026-09-03T00:00:00Z" },
        { id: "4", delivery_number: "SJ-4", dispatched_qty: 10, delivered_qty: 0, delivery_status: "failed", created_at: "2026-09-04T00:00:00Z" },
        { id: "5", delivery_number: "SJ-5", dispatched_qty: 10, delivered_qty: 0, delivery_status: "pending", created_at: "2026-09-05T00:00:00Z" },
      ],
      pagination: {},
    });

    const rows = await getOutletHistory(ID);

    expect(rows.map((r) => r.status)).toEqual(["Selesai", "Selesai", "Proses", "Tertunda", "Antrian"]);
  });
});

describe("writing", () => {
  /**
   * An update carries the version the caller last read.
   *
   * Read immediately before the write, because the form holds a domain object
   * with no version field. Without it the service refuses every update with
   * 409, and the form would be permanently unable to save.
   */
  it("reads the version before updating and sends it back", async () => {
    getOne.mockResolvedValue(wire({ version: 9 }));
    send.mockResolvedValue(wire({ version: 10 }));

    await outletApiHttp.createOrUpdateOutlet({ id: ID, nama: "Pangkalan Ahmad Jaya" });

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(path).toBe(`/outlets/${ID}`);
    expect(body.version).toBe(9);
    expect(body.name).toBe("Pangkalan Ahmad Jaya");
  });

  /** A create has no version to send, and no id in the path. */
  it("posts a create without a version", async () => {
    send.mockResolvedValue(wire());

    await outletApiHttp.createOrUpdateOutlet({ nama: "Baru", kode: "PKL-009" });

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe("/outlets");
    expect(body.version).toBeUndefined();
    expect(getOne).not.toHaveBeenCalled();
  });

  /** The default receiving account is written like any other field -- this
   *  is what makes recording it in the outlet form persist at all. */
  it("writes the default bank and account number", async () => {
    send.mockResolvedValue(wire());

    await outletApiHttp.createOrUpdateOutlet({
      nama: "Baru",
      kode: "PKL-009",
      bank: "BNI",
      noRekening: "1234567890",
    });

    const [, , body] = send.mock.calls[0];
    expect(body.bank_name).toBe("BNI");
    expect(body.bank_account_number).toBe("1234567890");
  });

  /**
   * The monthly quota is never written from this form.
   *
   * It is a sum over core.outlet_targets, edited per product per month on its
   * own screen. Sending it here would be a second author for a number derived
   * from others, and the two would disagree the first time either was used.
   */
  it("never sends the monthly quota", async () => {
    send.mockResolvedValue(wire());

    await outletApiHttp.createOrUpdateOutlet({ nama: "Baru", kuotaBulanan: 999 });

    const body = send.mock.calls[0][2];
    expect(Object.keys(body)).not.toContain("current_month_target_qty");
    expect(JSON.stringify(body)).not.toContain("999");
  });

  /**
   * The console's two words, back into the schema's three letters — and only on
   * an update.
   *
   * `CreateOutletRequest` does not declare `status`, and the server refuses an
   * unrecognised field outright rather than ignoring it, so sending one on
   * create is a 422 on every new outlet. That is the right shape: an outlet is
   * created active, and deactivating one is a decision about a record that
   * already exists.
   */
  it("sends the status on update and never on create", async () => {
    getOne.mockResolvedValue(wire({ version: 2 }));
    send.mockResolvedValue(wire());
    await outletApiHttp.createOrUpdateOutlet({ id: ID, status: "Nonaktif" });
    expect(send.mock.calls[0][2].status).toBe("ina");

    send.mockReset();
    send.mockResolvedValue(wire());
    await outletApiHttp.createOrUpdateOutlet({ nama: "Baru", status: "Aktif" });
    expect(send.mock.calls[0][2]).not.toHaveProperty("status");
  });

  /**
   * 0, 0 is the outlet form's own sentinel for "no pin yet" (see
   * `OutletFormPage`'s `EMPTY`), not a real point -- sending it would write a
   * geography point off the coast of Africa that the route optimizer would
   * then treat as this outlet's actual location.
   */
  it("does not send 0,0 as a location", async () => {
    send.mockResolvedValue(wire());

    await outletApiHttp.createOrUpdateOutlet({ nama: "Baru", kode: "PKL-009", lat: 0, lng: 0 });

    const body = send.mock.calls[0][2];
    expect(body).not.toHaveProperty("latitude");
    expect(body).not.toHaveProperty("longitude");
  });

  it("sends a real location", async () => {
    send.mockResolvedValue(wire());

    await outletApiHttp.createOrUpdateOutlet({
      nama: "Baru",
      kode: "PKL-009",
      lat: -7.3305,
      lng: 110.5084,
    });

    const body = send.mock.calls[0][2];
    expect(body.latitude).toBe(-7.3305);
    expect(body.longitude).toBe(110.5084);
  });
});

describe("billing details and branch (parity P3)", () => {
  it("reads province, postal code, NPWP and email", async () => {
    getOne.mockResolvedValue(wire({ province: "Jawa Tengah", postal_code: "50711", npwp: "01.234", email: "a@b.test" }));
    const o = await outletApiHttp.getOutletDetail(ID);
    expect(o).toMatchObject({ provinsi: "Jawa Tengah", kodePos: "50711", npwp: "01.234", email: "a@b.test" });
  });

  it("files a new outlet under the given branch and leaves blank billing fields out", async () => {
    send.mockResolvedValue(wire());
    await outletApiHttp.createOrUpdateOutlet({ nama: "Baru", kode: "PKL-010", branchId: "br-2", npwp: " ", email: " a@b.test ", kodePos: "" });
    const body = send.mock.calls[0][2];
    expect(body.branch_id).toBe("br-2");
    expect(body.email).toBe("a@b.test");
    expect("npwp" in body).toBe(false);
    expect("postal_code" in body).toBe(false);
  });

  it("clears a billing field on update and never moves the branch", async () => {
    getOne.mockResolvedValue(wire({ version: 5 }));
    send.mockResolvedValue(wire());
    await outletApiHttp.createOrUpdateOutlet({ id: ID, branchId: "br-2", email: "" });
    const body = send.mock.calls[0][2];
    expect(body.email).toBe("");
    expect("branch_id" in body).toBe(false);
  });
});
