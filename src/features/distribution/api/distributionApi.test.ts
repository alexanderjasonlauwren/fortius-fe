import { describe, expect, it, vi, beforeEach } from "vitest";

/**
 * The HTTP adapter's mapping, which is where the two sources drift.
 *
 * The wire shape and the domain model disagree on language, on status
 * vocabulary, and — most consequentially here — on what a "stop" is: the
 * service stores a line per (outlet, product) because that is what quota is
 * drawn against, while the planning screen shows one stop per outlet. None of
 * that is visible from a screen until a number is wrong, so it is asserted here.
 */

const getList = vi.fn();
const getOne = vi.fn();
const send = vi.fn();
const scopeState = vi.hoisted(() => ({ key: ["tenant", "branch"] }));
vi.mock("@/lib/scope", () => ({ scopeKey: () => scopeState.key }));

vi.mock("@/lib/api", () => ({
  getList: (...args: unknown[]) => getList(...args),
  getOne: (...args: unknown[]) => getOne(...args),
  send: (...args: unknown[]) => send(...args),
  upload: vi.fn(),
}));

const printDocument = vi.fn();
vi.mock("@/lib/export", () => ({
  printDocument: (...args: unknown[]) => printDocument(...args),
}));

const getOutletList = vi.fn();
vi.mock("@/features/outlet/api/outletApi", () => ({
  getOutletList: (...args: unknown[]) => getOutletList(...args),
}));

const getSettings = vi.fn();
vi.mock("@/features/settings/api/settingsApi", () => ({
  getSettings: (...args: unknown[]) => getSettings(...args),
}));

const { distributionApiHttp, printRouteSheet } = await import("./distributionApi.http");

const PLAN_ID = "11111111-1111-4111-8111-111111111111";
const SA_ID = "22222222-2222-4222-8222-222222222222";
const OUTLET_A = "33333333-3333-4333-8333-333333333333";
const OUTLET_B = "44444444-4444-4444-8444-444444444444";

function item(overrides: Record<string, unknown> = {}) {
  return {
    id: "55555555-5555-4555-8555-555555555555",
    outlet_id: OUTLET_A,
    outlet_code: "PKL-001",
    outlet_name: "Pangkalan Ahmad",
    product_id: "66666666-6666-4666-8666-666666666666",
    product_code: "LPG-003",
    product_name: "LPG 3 Kg",
    quota_allocation_id: "77777777-7777-4777-8777-777777777777",
    agreement_id: SA_ID,
    agreement_number: "SA-2026-09-001",
    planned_qty: 30,
    assigned: false,
    payment_method: "cash",
    payment_state: "unpaid",
    item_status: "pending",
    ...overrides,
  };
}

function order(overrides: Record<string, unknown> = {}) {
  return {
    id: PLAN_ID,
    order_number: "RD-SLT-20260905-0001",
    order_date: "2026-09-01",
    planned_delivery_date: "2026-09-05",
    order_status: "draft",
    total_outlets: 1,
    total_drivers: 0,
    total_qty: 30,
    items: [item()],
    version: 4,
    created_at: "2026-09-01T02:00:00Z",
    updated_at: "2026-09-01T02:00:00Z",
    ...overrides,
  };
}

beforeEach(() => {
  getList.mockReset();
  getOne.mockReset();
  send.mockReset();
  printDocument.mockReset();
  getOutletList.mockReset();
  getSettings.mockReset();
});

describe("plan mapping", () => {
  /**
   * The version has to survive the mapping.
   *
   * Every write echoes it back, and the service refuses a stale one with 409.
   * Dropped here, the console would send whatever it defaulted to and every
   * save would either be refused or — worse, if it defaulted to something that
   * happened to match — overwrite a change it never saw.
   */
  it("carries the version through", async () => {
    getList.mockResolvedValue({ items: [order()], pagination: {} });

    const [plan] = await distributionApiHttp.getPlanList();

    expect(plan.version).toBe(4);
    expect(plan.kode).toBe("RD-SLT-20260905-0001");
    expect(plan.tanggal).toBe("2026-09-05");
  });

  /**
   * A plan spending two agreements names neither.
   *
   * The console's model has one `saId` per plan and the service records one per
   * stop, so the field can only be derived. Picking the first agreement found
   * would put a quota figure on screen that describes part of the plan while
   * looking like it describes all of it.
   */
  it("leaves the agreement blank when the stops do not agree on one", async () => {
    getOne.mockResolvedValue(
      order({
        items: [
          item(),
          item({ id: "x", outlet_id: OUTLET_B, agreement_id: "other", agreement_number: "SA-B" }),
        ],
      }),
    );

    const plan = await distributionApiHttp.getPlan(PLAN_ID);

    expect(plan.saId).toBe("");
    expect(plan.nomorSA).toBe("Beberapa SA");
  });

  /**
   * A plan with no stops still names its agreement.
   *
   * This is the case the per-stop derivation cannot answer, and it is the
   * ordinary one: a planner opens the day, picks the SA, and has not added a
   * stop yet. Without the order's own `default_sa_id` the screen forgot the
   * choice the moment the plan was created, reported "sisa kuota 0", and
   * refused the first stop as exceeding a quota it could not see.
   */
  it("names the agreement on a plan with no stops", async () => {
    getOne.mockResolvedValue(
      order({
        items: [],
        agreement_id: SA_ID,
        agreement_number: "SA-2026-09-001",
        agreement_remaining: 4200,
      }),
    );

    const plan = await distributionApiHttp.getPlan(PLAN_ID);

    expect(plan.saId).toBe(SA_ID);
    expect(plan.nomorSA).toBe("SA-2026-09-001");
    expect(plan.sisaKuotaSA).toBe(4200);
  });

  /** The choice is sent on create, so the service can remember it. */
  it("sends the chosen agreement when opening a plan", async () => {
    send.mockResolvedValue(order({ items: [] }));

    await distributionApiHttp.createPlan({ tanggal: "2026-09-05", saId: SA_ID });

    expect(send.mock.calls[0][2].agreement_id).toBe(SA_ID);
  });

  it("creates a source-backed plan through the batch endpoint", async () => {
    send.mockResolvedValue(order());

    await distributionApiHttp.createSourcePlan({ batchId: "batch-1", tanggal: "2026-09-05", notes: "pagi" });

    expect(send).toHaveBeenCalledWith("post", "/sim3lon-imports/batch-1/plans", {
      operational_date: "2026-09-05",
      notes: "pagi",
    });
  });

  it("names the agreement when every stop draws on the same one", async () => {
    getOne.mockResolvedValue(order());

    const plan = await distributionApiHttp.getPlan(PLAN_ID);

    expect(plan.saId).toBe(SA_ID);
    expect(plan.nomorSA).toBe("SA-2026-09-001");
  });

  /** The service's five states, in the console's four words. */
  it("maps in_progress onto Terkonfirmasi rather than inventing a word", async () => {
    getOne.mockResolvedValue(order({ order_status: "in_progress" }));
    expect((await distributionApiHttp.getPlan(PLAN_ID)).status).toBe("Terkonfirmasi");

    getOne.mockResolvedValue(order({ order_status: "cancelled" }));
    expect((await distributionApiHttp.getPlan(PLAN_ID)).status).toBe("Batal");
  });
});

describe("allocation and payment control mapping", () => {
  it("maps the workbook-shaped monthly grid without losing absent cells or signed remainder", async () => {
    getOne.mockResolvedValue({
      month: "2026-08",
      dates: ["2026-08-01", "2026-08-02"],
      rows: [{
        outlet_id: OUTLET_A,
        outlet_code: "4507441079858009",
        outlet_name: "Agus Triyanto",
        cells: { "2026-08-01": 50 },
        target_qty: 40,
        total: 50,
        remaining_qty: -10,
      }],
      footer: [{ date: "2026-08-01", planned: 50, required: 60, has_target: true, shortfall: 10 }],
      totals: { planned: 50, required: 60, shortfall: 10, outlets: 1 },
    });

    const grid = await distributionApiHttp.getMonthlyGrid("2026-08");

    expect(getOne).toHaveBeenCalledWith("/distribution/grid?month=2026-08");
    expect(grid.rows[0]).toMatchObject({
      outletCode: "4507441079858009",
      targetQty: 40,
      remainingQty: -10,
      cells: { "2026-08-01": 50 },
    });
    expect(grid.rows[0].cells["2026-08-02"]).toBeUndefined();
  });

  it("keeps an unverified payment visible without mapping it to funded quantity", async () => {
    getOne.mockResolvedValue({
      date: "2026-08-01",
      cutoff: "15:00:00",
      timezone: "Asia/Jakarta",
      rows: [{
        outlet_id: OUTLET_A,
        outlet_code: "4507441079858009",
        outlet_name: "Agus Triyanto",
        planned_qty: 50,
        funded_qty: 0,
        unpaid_qty: 50,
        credit_qty: 0,
        delivered_qty: 0,
        state: "unpaid",
        has_unverified_payment: true,
      }],
      summary: {
        required: 50,
        has_target: true,
        planned: 50,
        funded: 0,
        unpaid: 50,
        delivered: 0,
        shortfall: 50,
        outlets: 1,
        paid_outlets: 0,
        late_outlets: 0,
      },
    });

    const board = await distributionApiHttp.getPaymentBoard("2026-08-01");

    expect(board.rows[0]).toMatchObject({ fundedQty: 0, unpaidQty: 50, hasUnverifiedPayment: true });
  });
});

describe("stop mapping", () => {
  /**
   * One outlet taking two products is one stop, not two.
   *
   * The truck visits the pangkalan once. Rendered as two rows the planner sees
   * a route with a duplicate address, assigns them to different drivers, and
   * the schema refuses it — `ex_doi_outlet_one_sequence` exists precisely
   * because an outlet cannot be at two positions on one run.
   */
  it("groups a stop's products into one row", async () => {
    getOne
      .mockResolvedValueOnce(
        order({
          items: [
            item(),
            item({ id: "second", product_id: "p2", product_name: "LPG 12 Kg", planned_qty: 5 }),
          ],
        }),
      )
      .mockRejectedValueOnce(new Error("no board yet"));

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0].lines).toHaveLength(2);
    expect(rows[0].jumlahUnit).toBe(35);
  });

  /**
   * A cancelled stop is not on the plan any more.
   *
   * The service keeps the row for its quota lineage rather than deleting it, so
   * an adapter that forwarded everything would put stops back on the route that
   * the planner had already dropped — and the truck would be loaded for them.
   */
  it("drops cancelled stops", async () => {
    getOne
      .mockResolvedValueOnce(
        order({ items: [item({ item_status: "cancelled" }), item({ id: "live", outlet_id: OUTLET_B, outlet_name: "Pangkalan Budi" })] }),
      )
      .mockRejectedValueOnce(new Error("no board yet"));

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0].outlet).toBe("Pangkalan Budi");
  });

  /**
   * Any unpaid line makes the whole stop unpaid.
   *
   * The truck is loaded per stop: the funded half cannot be delivered on its
   * own, so reporting the stop as paid because one of its lines is would tell
   * the planner a stop is clear to load when it is not.
   */
  it("marks a stop unpaid when any of its lines is", async () => {
    getOne
      .mockResolvedValueOnce(
        order({
          items: [
            item({ payment_state: "paid" }),
            item({ id: "second", product_id: "p2", payment_state: "unpaid" }),
          ],
        }),
      )
      .mockRejectedValueOnce(new Error("no board yet"));

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].statusBayar).toBe("Belum Lunas");
  });

  it("does not show a pending linked payment as paid", async () => {
    getOne
      .mockResolvedValueOnce(
        order({ items: [item({ payment_state: "paid", payment_status: "pending" })] }),
      )
      .mockRejectedValueOnce(new Error("no board yet"));

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].statusBayar).toBe("Belum Lunas");
  });

  /**
   * A dispatched line settles through its own invoice now, not through the
   * old Alokasikan link -- so payment_state stays "unpaid" forever (nobody
   * funds it that way anymore) while invoice_payment_status is what actually
   * moved to "paid" the moment SettleFromSIM3LON ran. Reading only
   * payment_state/payment_status here is exactly the bug that showed a
   * dispatched, already-invoiced stop as "Belum dialokasikan" on the plan
   * board.
   */
  it("shows Lunas from the dispatch-time invoice even though the old Alokasikan link is still unpaid", async () => {
    getOne
      .mockResolvedValueOnce(
        order({
          items: [item({ payment_state: "unpaid", invoice_payment_status: "paid" })],
        }),
      )
      .mockRejectedValueOnce(new Error("no board yet"));

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].statusBayar).toBe("Lunas");
  });

  /**
   * The crew comes from the dispatch board, and its absence is not an error.
   *
   * A plan nobody has assigned yet has no board. Failing the read would render
   * an error page for the most ordinary state a draft can be in — so the stops
   * come back with nobody driving them, which is the truth.
   */
  it("renders the stops when there is no board yet", async () => {
    getOne.mockResolvedValueOnce(order()).mockRejectedValueOnce(new Error("no board"));

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows).toHaveLength(1);
    expect(rows[0].driverId).toBeNull();
    expect(rows[0].driver).toBe("Belum ditetapkan");
  });

  it("takes the driver and trip from the board when there is one", async () => {
    getOne.mockResolvedValueOnce(order()).mockResolvedValueOnce({
      trips: [
        {
          trip_no: 2,
          driver_id: "d1",
          driver_code: "DRV-001",
          driver_name: "Slamet",
          vehicle_id: "v1",
          plate: "H 1234 AB",
          stops: [
            { sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Pangkalan Ahmad", qty: 30, funded: true },
          ],
          load_qty: 30,
          capacity_qty: 100,
          at_risk_qty: 0,
          distance_m: 4200,
        },
      ],
      unroutable: [],
      summary: { distance_m: 4200, trips: 1, outlets: 1 },
    });

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].driverId).toBe("d1");
    expect(rows[0].driver).toBe("Slamet");
    expect(rows[0].tripNo).toBe(2);
  });

  /**
   * The board is read back the way it will be driven, not alphabetically --
   * `suggest()` used to be thrown away the moment a board was saved, because
   * this mapping sorted by outlet name regardless of what the optimizer or a
   * dispatcher's manual reorder had put in `sequence_no`.
   */
  it("orders rows by trip and sequence, not by name", async () => {
    getOne
      .mockResolvedValueOnce(
        order({
          items: [
            item({ outlet_id: OUTLET_A, outlet_name: "Pangkalan Zeta" }),
            item({ id: "second", outlet_id: OUTLET_B, outlet_name: "Pangkalan Ahmad" }),
          ],
        }),
      )
      .mockResolvedValueOnce({
        trips: [
          {
            trip_no: 1,
            driver_id: "d1",
            driver_code: "DRV-001",
            driver_name: "Slamet",
            vehicle_id: "v1",
            plate: "H 1234 AB",
            stops: [
              { sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Pangkalan Zeta", qty: 30, funded: true },
              { sequence_no: 2, outlet_id: OUTLET_B, outlet_code: "PKL-002", outlet_name: "Pangkalan Ahmad", qty: 30, funded: true },
            ],
            load_qty: 60,
            capacity_qty: 100,
            at_risk_qty: 0,
            distance_m: 4200,
          },
        ],
        unroutable: [],
        summary: { distance_m: 4200, trips: 1, outlets: 2 },
      });

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows.map((r) => r.outlet)).toEqual(["Pangkalan Zeta", "Pangkalan Ahmad"]);
    expect(rows[0].urutan).toBe(1);
    expect(rows[1].urutan).toBe(2);
  });

  /**
   * `sequence_no` is a stop's position within its run, not a trip number --
   * confusing the two used to send an outlet with `sequence_no` 3 onto "Trip
   * 3" it had never been assigned to.
   */
  it("does not read a stop position as a trip number", async () => {
    getOne
      .mockResolvedValueOnce(order({ items: [item({ sequence_no: 3 })] }))
      .mockRejectedValueOnce(new Error("no board yet"));

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].tripNo).toBeNull();
  });
});

describe("driver options", () => {
  /**
   * A driver nobody has crewed yet still has a ceiling to plan against.
   *
   * Capacity belongs to the truck and the pairing is decided when the run is
   * built, so before that the honest ceiling is the largest truck the depot
   * could give them. Reporting zero — which is what "no trip, no capacity"
   * produced — made the planning screen call every stop an overload and refuse
   * to confirm the plan at all.
   */
  it("falls back to the largest available truck for an uncrewed driver", async () => {
    getList
      .mockResolvedValueOnce({
        items: [{ id: "d1", code: "DRV-001", full_name: "Slamet", status: "atv" }],
        pagination: {},
      })
      .mockResolvedValueOnce({
        items: [
          { capacity_qty: 240, operational_status: "available" },
          { capacity_qty: 560, operational_status: "available" },
          { capacity_qty: 9000, operational_status: "maintenance" },
        ],
        pagination: {},
      });
    getOne.mockRejectedValue(new Error("no board"));

    const [driver] = await distributionApiHttp.getDriverOptions(PLAN_ID);

    // 560, not 9000: a truck in the workshop is not one the depot can give.
    expect(driver.kapasitas).toBe(560);
    expect(driver.muatan).toBe(0);
  });
});

describe("saving", () => {
  /**
   * A stop is flattened back into a line per product, each naming the agreement.
   *
   * `quota_allocation_id` is NOT NULL on the service's side, so a line that did
   * not name an agreement could not be written at all — the save would fail on
   * a column the planner never sent.
   */
  it("sends one line per product, each carrying the agreement", async () => {
    getOne.mockResolvedValue(order());
    send.mockResolvedValue(order({ version: 6 }));

    await distributionApiHttp.saveDraft(
      PLAN_ID,
      [
        {
          id: "row", outletId: OUTLET_A, outlet: "Pangkalan Ahmad", alamat: "—",
          lines: [
            { productId: "p1", jumlah: 30 },
            { productId: "p2", jumlah: 5 },
          ],
          jumlahUnit: 35, driverId: null, driver: "—", vehicleId: null, vehicle: "—", jamPengiriman: "—",
          tripNo: null, statusBayar: "Belum Lunas", sisaKuotaOutlet: 0,
          piutang: 0, piutangJatuhTempo: 0,
        },
      ],
      4,
    );

    const [, , body] = send.mock.calls[0];
    expect(body.version).toBe(4);
    expect(body.items).toHaveLength(2);
    expect(body.items.every((i: { agreement_id: string }) => i.agreement_id === SA_ID)).toBe(true);
  });
  it("refuses a save if tenant switches during its internal plan read", async () => {
    scopeState.key = ["tenant", "branch"];
    getOne.mockImplementation(async () => { scopeState.key = ["other", "branch"]; return order(); });
    await expect(distributionApiHttp.saveDraft(PLAN_ID, [], 4)).rejects.toThrow("Tenant berubah");
    expect(send).not.toHaveBeenCalled();
    scopeState.key = ["tenant", "branch"];
  });

  /**
   * An empty line is dropped rather than sent as a zero.
   *
   * `planned_qty > 0` is a CHECK on the column, so a zero line is refused by the
   * database — and a stop the planner half-filled should not fail the whole
   * save.
   */
  it("drops lines with no product or no quantity", async () => {
    getOne.mockResolvedValue(order());
    send.mockResolvedValue(order({ version: 6 }));

    await distributionApiHttp.saveDraft(
      PLAN_ID,
      [
        {
          id: "row", outletId: OUTLET_A, outlet: "Pangkalan Ahmad", alamat: "—",
          lines: [
            { productId: "p1", jumlah: 30 },
            { productId: "", jumlah: 5 },
            { productId: "p3", jumlah: 0 },
          ],
          jumlahUnit: 30, driverId: null, driver: "—", vehicleId: null, vehicle: "—", jamPengiriman: "—",
          tripNo: null, statusBayar: "Belum Lunas", sisaKuotaOutlet: 0,
          piutang: 0, piutangJatuhTempo: 0,
        },
      ],
      1,
    );

    const [, , body] = send.mock.calls[0];
    expect(body.items).toHaveLength(1);
  });

  /**
   * A plan with no agreement refuses to save rather than guessing one.
   *
   * This is the gap the module header names: the service has nowhere to record
   * the agreement until the plan has a stop, so a plan reopened after being
   * saved empty has lost it. Saying so beats picking an agreement on the
   * planner's behalf and spending quota they did not choose.
   */
  it("refuses to save when the plan names no agreement", async () => {
    getOne.mockResolvedValue(order({ items: [] }));

    await expect(distributionApiHttp.saveDraft(PLAN_ID, [], 1)).rejects.toThrow(
      /Schedule Agreement/,
    );
    expect(send).not.toHaveBeenCalled();
  });

  it("sends the version on confirm and on cancel", async () => {
    send.mockResolvedValue(order({ order_status: "confirmed" }));
    await distributionApiHttp.confirmPlan(PLAN_ID, 7);
    expect(send.mock.calls[0][2]).toEqual({ version: 7 });

    send.mockResolvedValue({});
    await distributionApiHttp.cancelDistributionPlan(PLAN_ID, 8);
    expect(send.mock.calls[1][2]).toEqual({ version: 8 });
  });
});

describe("committing the board", () => {
  /**
   * The vehicle travels with the driver, because the service will not take one
   * without the other: `dispatch_trips.vehicle_id` is NOT NULL. Sending a run
   * with a driver alone is a 422 on the whole board.
   */
  it("sends the driver and the vehicle for each run", async () => {
    send.mockResolvedValue({});

    await distributionApiHttp.applyAssignment(PLAN_ID, [
      {
        driverId: "d1",
        vehicleId: "v1",
        tripNo: 1,
        stops: [
          { outletId: OUTLET_A, sequenceNo: 1 },
          { outletId: OUTLET_B, sequenceNo: 2 },
        ],
      },
    ], 7);

    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("put");
    expect(path).toBe(`/distribution/orders/${PLAN_ID}/assignment`);
    expect(body.version).toBe(7);
    expect(body.trips[0]).toEqual({
      driver_id: "d1",
      vehicle_id: "v1",
      trip_no: 1,
      stops: [
        { outlet_id: OUTLET_A, sequence_no: 1 },
        { outlet_id: OUTLET_B, sequence_no: 2 },
      ],
    });
  });

  /**
   * A stop's crew comes back from the dispatch board, vehicle included — that
   * is the only place the pairing is real, since a driver owns no truck.
   */
  it("reads the vehicle back from the board", async () => {
    getOne.mockResolvedValueOnce(order()).mockResolvedValueOnce({
      trips: [
        {
          trip_no: 1, driver_id: "d1", driver_code: "DRV-001", driver_name: "Slamet",
          vehicle_id: "v1", plate: "H 1234 AB",
          stops: [{ sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Ahmad", qty: 30, funded: true }],
          load_qty: 30, capacity_qty: 240, at_risk_qty: 0, distance_m: 0,
        },
      ],
      unroutable: [],
      summary: { distance_m: 0, trips: 1, outlets: 1 },
    });

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].vehicleId).toBe("v1");
    expect(rows[0].vehicle).toBe("H 1234 AB");
  });

  /** A truck in the workshop is not one the depot can send out today. */
  it("offers only available trucks", async () => {
    getList.mockResolvedValue({ items: [], pagination: {} });

    await distributionApiHttp.getVehicleOptions();

    expect(getList.mock.calls[0][1].filters).toContainEqual({
      field: "operational_status", operator: "eq", value: "available",
    });
  });

  /**
   * D3 A-Step 2/3: a saved board carries the real dispatch_trips.id and its
   * status, needed to dispatch it -- neither existed on this response until
   * this step, and both are read here rather than assumed present.
   */
  it("reads the trip id and status back from the board", async () => {
    getOne.mockResolvedValueOnce(order()).mockResolvedValueOnce({
      trips: [
        {
          id: "trip-1", trip_status: "dispatched",
          trip_no: 1, driver_id: "d1", driver_code: "DRV-001", driver_name: "Slamet",
          vehicle_id: "v1", plate: "H 1234 AB",
          stops: [{ sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Ahmad", qty: 30, funded: true }],
          load_qty: 30, capacity_qty: 240, at_risk_qty: 0, distance_m: 0,
        },
      ],
      unroutable: [],
      summary: { distance_m: 0, trips: 1, outlets: 1 },
    });

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].tripId).toBe("trip-1");
    expect(rows[0].tripStatus).toBe("dispatched");
  });

  /**
   * The board's own ETA estimate reaches the planning screen's Jam column,
   * rather than the column staying "—" forever now that the service can
   * actually compute one. See distributionApi.http.ts's own note on why "—"
   * used to be the only honest answer.
   */
  it("shows the board's ETA in the Jam column", async () => {
    getOne.mockResolvedValueOnce(order()).mockResolvedValueOnce({
      trips: [
        {
          trip_no: 1, driver_id: "d1", driver_code: "DRV-001", driver_name: "Slamet",
          vehicle_id: "v1", plate: "H 1234 AB", planned_departure_time: "07:00",
          stops: [{ sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Ahmad", qty: 30, funded: true, eta: "07:15" }],
          load_qty: 30, capacity_qty: 240, at_risk_qty: 0, distance_m: 0,
        },
      ],
      unroutable: [],
      summary: { distance_m: 0, trips: 1, outlets: 1 },
    });

    const rows = await distributionApiHttp.getPlanDetail(PLAN_ID);

    expect(rows[0].jamPengiriman).toBe("07:15");
    expect(rows[0].berangkat).toBe("07:00");
  });

  /**
   * A trip's departure is sent only when the draft actually has one -- a
   * board built before any of this existed, or one nobody has suggested for,
   * commits exactly the request it always did.
   */
  it("sends the planned departure time only when the trip has one", async () => {
    send.mockResolvedValue({});

    await distributionApiHttp.applyAssignment(PLAN_ID, [
      {
        driverId: "d1", vehicleId: "v1", tripNo: 1,
        stops: [{ outletId: OUTLET_A, sequenceNo: 1 }],
        berangkat: "07:00",
      },
    ], 7);

    expect(send.mock.calls[0][2].trips[0].planned_departure_time).toBe("07:00");
  });
});

describe("dispatching a trip", () => {
  it("sends the credit overrides, wire-shaped, and counts what was issued", async () => {
    send.mockResolvedValue({ trip_id: "trip-1", issued: [{}, {}] });

    const result = await distributionApiHttp.dispatchTrip("trip-1", [
      { outletId: OUTLET_A, secondApproverId: "user-2", reason: "Pelunasan sudah dijadwalkan" },
    ]);

    expect(send).toHaveBeenCalledWith("post", "/distribution/trips/trip-1/dispatch", {
      credit_overrides: [
        { outlet_id: OUTLET_A, second_approver_id: "user-2", reason: "Pelunasan sudah dijadwalkan" },
      ],
    });
    expect(result.issued).toBe(2);
  });

  it("sends an empty array rather than omitting the field when there is no override", async () => {
    send.mockResolvedValue({ trip_id: "trip-1", issued: [{}] });

    await distributionApiHttp.dispatchTrip("trip-1");

    expect(send).toHaveBeenCalledWith("post", "/distribution/trips/trip-1/dispatch", {
      credit_overrides: [],
    });
  });
});

describe("the suggestion", () => {
  /**
   * The service's proposal says the route was considered, and the mock's does
   * not. That single line is the one place the two builds are supposed to
   * differ, so it must not be copied from the packer.
   */
  it("reports the distance the service actually routed", async () => {
    send.mockResolvedValue({
      trips: [
        {
          trip_no: 1, driver_id: "d1", driver_code: "DRV-001", driver_name: "Slamet",
          vehicle_id: "v1", plate: "H 1234 AB",
          stops: [
            { sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Ahmad", qty: 30, funded: true },
            { sequence_no: 2, outlet_id: OUTLET_B, outlet_code: "PKL-002", outlet_name: "Budi", qty: 20, funded: false },
          ],
          load_qty: 50, capacity_qty: 100, at_risk_qty: 20, distance_m: 12500,
        },
      ],
      unroutable: [
        { outlet_id: "z", outlet_code: "PKL-009", outlet_name: "Jauh", qty: 10, reason: "Di luar jangkauan" },
      ],
      summary: { distance_m: 12500, trips: 1, outlets: 2 },
    });

    const suggestion = await distributionApiHttp.suggestAssignment(PLAN_ID);

    expect(suggestion.trips[0].stops.map((s) => s.urutan)).toEqual([1, 2]);
    expect(suggestion.trips[0].muatanBerisiko).toBe(20);
    expect(suggestion.unroutable[0].alasan).toBe("Di luar jangkauan");
    expect(suggestion.dasar).toMatch(/12,5 km/);
  });

  /**
   * The service's proposal carries a schedule the mock cannot (see
   * suggestAssignment.ts's own DASAR_KAPASITAS note) -- each stop's estimated
   * arrival and the run's estimated departure both need to survive the
   * mapping, and the finish time belongs in the planner's own explanation.
   */
  it("carries the service's schedule onto the proposal", async () => {
    send.mockResolvedValue({
      trips: [
        {
          trip_no: 1, driver_id: "d1", driver_code: "DRV-001", driver_name: "Slamet",
          vehicle_id: "v1", plate: "H 1234 AB", planned_departure_time: "07:00",
          stops: [
            { sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Ahmad", qty: 30, funded: true, eta: "07:15" },
          ],
          load_qty: 30, capacity_qty: 100, at_risk_qty: 0, distance_m: 4000,
        },
      ],
      unroutable: [],
      summary: { distance_m: 4000, trips: 1, outlets: 1, finish_eta: "07:45" },
    });

    const suggestion = await distributionApiHttp.suggestAssignment(PLAN_ID);

    expect(suggestion.trips[0].berangkat).toBe("07:00");
    expect(suggestion.trips[0].stops[0].eta).toBe("07:15");
    expect(suggestion.dasar).toMatch(/07:45/);
  });

  /**
   * A dispatcher reading "± 15 km" should know whether that is a real road
   * distance or the usual haversine estimate -- the note only appears for the
   * former, since the latter is what every suggestion has always been and
   * flagging the ordinary case would just be noise.
   */
  it("notes when the distance is a road distance, not haversine", async () => {
    send.mockResolvedValue({
      trips: [
        {
          trip_no: 1, driver_id: "d1", driver_code: "DRV-001", driver_name: "Slamet",
          vehicle_id: "v1", plate: "H 1234 AB",
          stops: [
            { sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Ahmad", qty: 30, funded: true },
          ],
          load_qty: 30, capacity_qty: 100, at_risk_qty: 0, distance_m: 4000,
        },
      ],
      unroutable: [],
      summary: { distance_m: 4000, trips: 1, outlets: 1, distance_source: "road" },
    });

    const suggestion = await distributionApiHttp.suggestAssignment(PLAN_ID);

    expect(suggestion.dasar).toMatch(/jarak jalan/);
  });

  it("stays silent about the source when it is the ordinary straight-line estimate", async () => {
    send.mockResolvedValue({
      trips: [
        {
          trip_no: 1, driver_id: "d1", driver_code: "DRV-001", driver_name: "Slamet",
          vehicle_id: "v1", plate: "H 1234 AB",
          stops: [
            { sequence_no: 1, outlet_id: OUTLET_A, outlet_code: "PKL-001", outlet_name: "Ahmad", qty: 30, funded: true },
          ],
          load_qty: 30, capacity_qty: 100, at_risk_qty: 0, distance_m: 4000,
        },
      ],
      unroutable: [],
      summary: { distance_m: 4000, trips: 1, outlets: 1, distance_source: "straight" },
    });

    const suggestion = await distributionApiHttp.suggestAssignment(PLAN_ID);

    expect(suggestion.dasar).not.toMatch(/jarak jalan/);
  });
});

describe("addApprovedOrders", () => {
  it("calls orderApi's own schedule request, not a second copy of it", async () => {
    getOne.mockResolvedValue({ version: 5 });
    send.mockResolvedValue(undefined);

    const { addApprovedOrders } = await import("./distributionApi.http");
    const count = await addApprovedOrders(PLAN_ID, [OUTLET_A]);

    expect(count).toBe(1);
    const [method, path, body] = send.mock.calls[0];
    expect(method).toBe("post");
    expect(path).toBe(`/orders/${OUTLET_A}/schedule`);
    expect(body).toEqual({ version: 5, distribution_order_id: PLAN_ID });
  });
});

// The bug this exists to prevent: a new stop defaulting to whatever product
// sorts first in the whole catalogue, regardless of what the plan's own SA
// was imported for.
describe("the SA's own product options", () => {
  it("reads the agreement's product quota, not the catalogue", async () => {
    getOne.mockResolvedValue({
      products: [{ product_id: "prod-1", product_name: "Bright Gas 12 Kg" }],
    });

    const options = await distributionApiHttp.getSAProductOptions(SA_ID);

    expect(getOne).toHaveBeenCalledWith(`/schedule-agreements/${SA_ID}`);
    expect(options).toEqual([{ id: "prod-1", label: "Bright Gas 12 Kg", satuan: "" }]);
  });

  // A hand-typed agreement, or one not yet applied, has no product quota row
  // at all -- empty, not a guess.
  it("is empty for an agreement with no product quota", async () => {
    getOne.mockResolvedValue({ products: [] });

    const options = await distributionApiHttp.getSAProductOptions(SA_ID);

    expect(options).toEqual([]);
  });

  it("does not call the API for an unset SA", async () => {
    const options = await distributionApiHttp.getSAProductOptions("");

    expect(options).toEqual([]);
    expect(getOne).not.toHaveBeenCalled();
  });
});

describe("the SA's own outlet plan for a date", () => {
  it("maps the agreement's SIM3LON-planned outlets for the date", async () => {
    getOne.mockResolvedValue([
      {
        outlet_id: OUTLET_A,
        outlet_name: "Pangkalan Ahmad",
        product_id: "prod-1",
        product_name: "Bright Gas 12 Kg",
        planned_qty: 70,
      },
    ]);

    const rows = await distributionApiHttp.getSAOutletPlan(SA_ID, "2026-09-15");

    expect(getOne).toHaveBeenCalledWith(
      `/schedule-agreements/${SA_ID}/outlet-plan?date=2026-09-15`,
    );
    expect(rows).toEqual([
      {
        outletId: OUTLET_A,
        outlet: "Pangkalan Ahmad",
        productId: "prod-1",
        productName: "Bright Gas 12 Kg",
        jumlah: 70,
      },
    ]);
  });

  // An SA typed by hand, or a date its import never covered: empty, not an
  // error -- the planner adds stops by hand as before.
  it("is empty when the import has nothing for the date", async () => {
    getOne.mockResolvedValue(null);

    const rows = await distributionApiHttp.getSAOutletPlan(SA_ID, "2026-09-15");

    expect(rows).toEqual([]);
  });

  it("does not call the API for an unset SA", async () => {
    const rows = await distributionApiHttp.getSAOutletPlan("", "2026-09-15");

    expect(rows).toEqual([]);
    expect(getOne).not.toHaveBeenCalled();
  });
});

describe("printRouteSheet", () => {
  beforeEach(() => {
    getOne.mockImplementation((path: string) =>
      Promise.resolve(path.endsWith("/trips") ? { trips: [], unroutable: [], summary: {} } : order()),
    );
    getSettings.mockResolvedValue({ namaPerusahaan: "PT Bimbo Salatiga", nomorAgen: "12345" });
    getOutletList.mockResolvedValue([
      { id: OUTLET_A, alamat: "Jl. Merdeka 12", kecamatan: "Sidorejo" },
    ]);
  });

  /**
   * The address gap this used to stay mock-only for is closed by
   * `getOutletList()` -- a real, already-implemented endpoint. The stop's
   * address in the printed sheet must be the outlet's real one, not a dash.
   */
  it("resolves each stop's address from the outlet list", async () => {
    await printRouteSheet(PLAN_ID);

    const [, html] = printDocument.mock.calls[0];
    expect(html).toContain("Jl. Merdeka 12, Kec. Sidorejo");
  });

  /** The clock-time gap is real, not closed -- no column anywhere carries
   *  it, so the sheet must say so rather than invent one. */
  it("still shows no invented delivery time", async () => {
    await printRouteSheet(PLAN_ID);

    const [, html] = printDocument.mock.calls[0];
    expect(html).toContain('<td class="code">—</td>');
  });

  /** An outlet missing from the list (a fetch race, a soft-deleted row)
   *  prints a dash rather than throwing the whole sheet away. */
  it("falls back to a dash when an outlet is not in the list", async () => {
    getOutletList.mockResolvedValue([]);

    await printRouteSheet(PLAN_ID);

    const [, html] = printDocument.mock.calls[0];
    expect(html).toContain("<td>—</td>");
  });
});
