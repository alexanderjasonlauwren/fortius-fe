/**
 * Distribution planning, against the real API.
 *
 * This is also where the language boundary sits. The backend speaks English and
 * matches its own schema; the UI domain model is Indonesian (`kode`, `tanggal`,
 * `jumlahUnit`). Mapping here rather than renaming either side keeps the
 * backend consistent with its published contract and leaves every component
 * untouched — the direction technical-gaps 2.4 chose.
 *
 * # Where the two models genuinely differ
 *
 * **The agreement is per stop, not per plan.** `DistributionPlan.saId` is one
 * field; the service records `agreement_id` on each line, because one plan can
 * legitimately spend a base SA and a doping SA. So the plan's agreement is
 * *derived* here: it is the one every stop draws on, or blank when the plan is
 * empty or mixed. `createPlan`'s `saId` is therefore the default applied to
 * stops as they are added rather than a value the service stores — a plan saved
 * with no stops does not remember it.
 *
 * **A stop's decoration is not on the wire.** The planning screen shows an
 * address, the outlet's remaining monthly quota, and its receivable beside each
 * stop. None of those are on the order-item response: the address belongs to
 * the outlet module, the quota to outlet targets, the receivable to finance.
 * They arrive here as "unknown" rather than as zero, because a zero receivable
 * reads as "this outlet owes nothing" and that is a claim this adapter cannot
 * make. `docs/technical-gaps.md` records the three.
 *
 * **The crew comes from the dispatch board**, which is a second request. The
 * order's own lines carry only whether a stop is on a run and where in it —
 * `driver_id` moved to `core.dispatch_trips` because a driver is a property of
 * the run rather than of one line.
 */
import { getList, getOne, send } from "@/lib/api";
import { printDocument } from "@/lib/export";
import { outletLabelTitle, unitLabelTitle } from "@/lib/lexicon";
import { scopeKey } from "@/lib/scope";
import { scheduleOneOrder } from "@/features/orders/api/orderApi.http";
import { getOutletList } from "@/features/outlet/api/outletApi";
import { getSettings } from "@/features/settings/api/settingsApi";
import { compareStops } from "../lib/stopOrder";
import type {
  AssignmentSuggestion,
  DistributionMonthGrid,
  DistributionPaymentBoard,
  DistributionPlan,
  DriverOption,
  PlanOption,
  PlanRow,
  PlanStatus,
  SAOutletPlanRow,
  VehicleOption,
  SuggestedStop,
  SuggestedTrip,
  UnroutableStop,
} from "../types";
import type {
  CreditOverrideInput,
  DispatchResult,
  DistributionApi,
  ProductOption,
  TripAssignment,
  PlanHistoryEvent,
} from "./contract";

/* ── wire shapes, mirroring the backend exactly ────────────────────────── */

interface OrderItemResponse {
  id: string;
  outlet_id?: string;
  outlet_code?: string;
  outlet_name?: string;
  product_id?: string;
  product_code?: string;
  product_name?: string;
  quota_allocation_id?: string;
  agreement_id?: string;
  agreement_number?: string;
  planned_qty: number;
  sequence_no?: number;
  assigned: boolean;
  payment_method: string;
  payment_state: string;
  payment_status?: string;
  // The invoice this line's own delivery raised at dispatch, settled
  // automatically -- see statusBayarFor. Distinct from payment_state/
  // payment_status above, which track the older, optional Alokasikan link
  // that most lines now never acquire.
  invoice_payment_status?: string;
  item_status: string;
  notes?: string;
}

interface OrderResponse {
  id: string;
  order_number: string;
  branch_id?: string;
  order_date: string;
  planned_delivery_date: string;
  order_status: string;
  total_outlets: number;
  total_drivers: number;
  total_qty: number;
  notes?: string;
  agreement_id?: string;
  agreement_number?: string;
  agreement_remaining?: number;
  confirmed_by?: string;
  confirmed_at?: string;
  completed_at?: string;
  items?: OrderItemResponse[];
  version: number;
  created_at: string;
  updated_at: string;
}

interface TripResponse {
  /** The real `dispatch_trips.id` — present on a saved board, needed to dispatch it. */
  id?: string;
  trip_status?: string;
  trip_no: number;
  driver_id: string;
  driver_code: string;
  driver_name: string;
  vehicle_id: string;
  plate: string;
  stops: {
    sequence_no: number;
    outlet_id: string;
    outlet_code: string;
    outlet_name: string;
    qty: number;
    funded: boolean;
    /** Estimated arrival, "HH:MM". Absent when the trip has no departure yet,
     *  or this stop's outlet has no coordinates. */
    eta?: string;
  }[];
  load_qty: number;
  capacity_qty: number;
  at_risk_qty: number;
  distance_m: number;
  /** Estimated departure, "HH:MM". Absent until a dispatcher or a suggestion
   *  sets one. */
  planned_departure_time?: string;
}

interface BoardResponse {
  trips: TripResponse[];
  unroutable: {
    outlet_id: string;
    outlet_code: string;
    outlet_name: string;
    qty: number;
    reason: string;
  }[];
  summary: {
    distance_m: number;
    trips: number;
    outlets: number;
    /** When the last truck is expected back, "HH:MM". Absent with no trips. */
    finish_eta?: string;
    /** "road" when an OSRM instance measured this suggestion's distances,
     *  "straight" when it fell back to haversine (no router configured, or it
     *  was unreachable). Absent on an older backend that predates this field —
     *  treat that the same as "straight", which was the only thing it could
     *  have been. */
    distance_source?: "road" | "straight";
  };
}

interface OutletResponse {
  id: string;
  code: string;
  name: string;
  district?: string;
  city?: string;
  status: string;
}

interface ProductResponse {
  id: string;
  code: string;
  name: string;
  unit_abbreviation?: string;
  weight_kg: number;
  status: string;
}

interface VehicleResponse {
  id: string;
  plate_number: string;
  vehicle_type: string;
  brand?: string;
  model?: string;
  capacity_qty: number;
  operational_status: string;
  status: string;
}

interface AgreementListResponse {
  id: string;
  sa_number: string;
  supplier_name?: string;
  sa_status: string;
  period_end: string;
  total_quota_qty: number;
  allocated_quota_qty: number;
}

interface GridResponse {
  month: string;
  dates: string[];
  rows: {
    outlet_id: string;
    outlet_code: string;
    outlet_name: string;
    cells: Record<string, number>;
    target_qty: number;
    total: number;
    remaining_qty: number;
  }[];
  footer: { date: string; planned: number; required: number; has_target: boolean; shortfall: number }[];
  totals: { planned: number; required: number; shortfall: number; outlets: number };
}

interface PaymentBoardWire {
  date: string;
  cutoff: string;
  timezone: string;
  rows: {
    outlet_id: string;
    outlet_code: string;
    outlet_name: string;
    planned_qty: number;
    funded_qty: number;
    unpaid_qty: number;
    credit_qty: number;
    delivered_qty: number;
    planned_amount: number;
    funded_amount: number;
    has_unpriced_line: boolean;
    distribution_order_id: string;
    plan_count: number;
    funding_payment_id?: string;
    funding_payment_number?: string;
    state: "paid" | "partial" | "unpaid" | "credit";
    last_payment_at?: string;
    late?: boolean;
    has_unverified_payment: boolean;
  }[];
  summary: {
    required: number;
    has_target: boolean;
    planned: number;
    funded: number;
    unpaid: number;
    delivered: number;
    shortfall: number;
    outlets: number;
    paid_outlets: number;
    late_outlets: number;
  };
}

/**
 * How many rows an option list asks for.
 *
 * 100 because that is every list definition's `MaxPageSize`, and the server
 * refuses more with a 400 naming the field rather than quietly clamping — asked
 * for 200, every picker on the planning screen failed to load. It is also
 * enough: a picker longer than this needs a search box, not a bigger page, and
 * the day one does the fix is to type into it rather than to raise this.
 */
const OPTION_PAGE_SIZE = 100;

/* ── mapping ───────────────────────────────────────────────────────────── */

/**
 * The service's five states mapped onto the console's four words.
 *
 * `in_progress` shows as Terkonfirmasi rather than gaining a word of its own: to
 * a planner a plan whose trucks have left is still the confirmed plan, and the
 * screen that tracks the journey is Monitoring Distribusi.
 */
const STATUS_TO_DOMAIN: Record<string, PlanStatus> = {
  draft: "Draf",
  confirmed: "Terkonfirmasi",
  in_progress: "Terkonfirmasi",
  completed: "Selesai",
  cancelled: "Batal",
};

function toPlanStatus(wire: string): PlanStatus {
  return STATUS_TO_DOMAIN[wire] ?? "Draf";
}

/**
 * The agreement every stop draws on, or blank when they do not agree.
 *
 * Blank rather than the first one found: a plan spending two agreements has no
 * single answer, and picking one would put a number on screen that describes
 * only part of the plan.
 */
function derivedAgreement(items: OrderItemResponse[]): { id: string; number: string } {
  const live = items.filter((i) => i.item_status !== "cancelled");
  const ids = new Set(live.map((i) => i.agreement_id ?? ""));
  if (ids.size !== 1) return { id: "", number: live.length ? "Beberapa SA" : "—" };
  return { id: live[0].agreement_id ?? "", number: live[0].agreement_number ?? "—" };
}

function toPlanView(order: OrderResponse): DistributionPlan {
  // The order's own default first, the stops' agreement second.
  //
  // The default is what the planner chose when they opened the day, so it is
  // right even for a plan with no stops yet — which is the case the derivation
  // cannot answer at all. Where a plan has stops that disagree with it, the
  // stops are what the regulator traces, so they win the label.
  const derived = derivedAgreement(order.items ?? []);
  const agreement =
    derived.id !== "" ? derived : { id: order.agreement_id ?? "", number: order.agreement_number ?? derived.number };
  return {
    id: order.id,
    branchId: order.branch_id,
    kode: order.order_number,
    tanggal: order.planned_delivery_date,
    totalUnit: order.total_qty,
    jumlahOutlet: order.total_outlets,
    jumlahDriver: order.total_drivers,
    status: toPlanStatus(order.order_status),
    saId: agreement.id,
    nomorSA: agreement.number,
    // What is left of the agreement, summed across its products, from the
    // order's own read. Zero when no agreement is set — the screen shows the
    // planner an agreement to choose rather than a quota to exceed.
    sisaKuotaSA: order.agreement_remaining ?? 0,
    catatan: order.notes,
    // The service records who confirmed a plan and not who drafted it: a draft
    // is attributed by created_by, which is not on the wire.
    dibuatOleh: "—",
    dikonfirmasiOleh: order.confirmed_by,
    dikonfirmasiPada: order.confirmed_at,
    version: order.version,
  };
}

/** Lunas/Belum Lunas/Kredit for one line -- see toPlanRows for how several
 *  of these fold into one stop-level status.
 *
 *  invoicePaymentStatus is checked first: it is the invoice the line's own
 *  delivery raised at dispatch and settled automatically (SIM3LON already
 *  confirms the outlet paid), which is now the normal path for every new
 *  dispatch. paymentState/paymentStatus are the older, optional Alokasikan
 *  link -- still checked as a fallback for a line funded that way instead,
 *  but no longer how a freshly dispatched line becomes Lunas. */
function statusBayarFor(
  paymentState?: string,
  paymentStatus?: string,
  invoicePaymentStatus?: string,
): PlanRow["statusBayar"] {
  if (invoicePaymentStatus === "paid") return "Lunas";
  if (paymentState === "credit") return "Kredit";
  if (paymentState === "paid" && paymentStatus === "verified") return "Lunas";
  return "Belum Lunas";
}

/**
 * One PlanRow per outlet, whatever the stop is carrying.
 *
 * The service stores a line per (outlet, product) because that is what quota is
 * drawn against; the planning screen shows a stop per outlet with its mix
 * beneath. Grouping here is what lets one outlet take two cylinder sizes
 * without appearing twice on the route.
 */
function toPlanRows(items: OrderItemResponse[], board?: BoardResponse): PlanRow[] {
  const crewByOutlet = new Map<
    string,
    {
      driverId: string;
      driver: string;
      vehicleId: string;
      vehicle: string;
      tripNo: number;
      tripId: string | null;
      tripStatus?: string;
      urutan: number;
      eta?: string;
      berangkat?: string;
    }
  >();
  for (const trip of board?.trips ?? []) {
    for (const stop of trip.stops) {
      crewByOutlet.set(stop.outlet_id, {
        driverId: trip.driver_id,
        driver: trip.driver_name,
        vehicleId: trip.vehicle_id,
        vehicle: trip.plate,
        tripNo: trip.trip_no,
        tripId: trip.id ?? null,
        tripStatus: trip.trip_status,
        urutan: stop.sequence_no,
        eta: stop.eta,
        berangkat: trip.planned_departure_time,
      });
    }
  }

  const byOutlet = new Map<string, PlanRow>();
  for (const item of items) {
    if (item.item_status === "cancelled") continue;
    const outletId = item.outlet_id ?? "";
    const crew = crewByOutlet.get(outletId);

    const row = byOutlet.get(outletId) ?? {
      // The first line's id addresses the stop. The screen edits stops, and a
      // stop that is several lines has no id of its own on the wire.
      id: item.id,
      outletId,
      outlet: item.outlet_name ?? "—",
      // Not on the order-item response; see the module header.
      alamat: "—",
      lines: [],
      jumlahUnit: 0,
      driverId: crew?.driverId ?? null,
      driver: crew?.driver ?? "Belum ditetapkan",
      vehicleId: crew?.vehicleId ?? null,
      vehicle: crew?.vehicle ?? "Belum ditetapkan",
      // The service plans a delivery date, not a time of day -- this is an
      // estimate from the board's own schedule, when it has one, and "—"
      // otherwise rather than a clock only the demo fills.
      jamPengiriman: crew?.eta ?? "—",
      // `item.sequence_no` is a stop's POSITION within its run, not a trip
      // number -- confusing the two used to send an outlet with sequence_no 3
      // onto "Trip 3" it had never been assigned to. A row with no board entry
      // has no trip at all.
      tripNo: crew?.tripNo ?? null,
      urutan: crew?.urutan ?? null,
      tripId: crew?.tripId ?? null,
      tripStatus: crew?.tripStatus,
      berangkat: crew?.berangkat ?? null,
      statusBayar: statusBayarFor(item.payment_state, item.payment_status, item.invoice_payment_status),
      sisaKuotaOutlet: 0,
      piutang: 0,
      piutangJatuhTempo: 0,
    } satisfies PlanRow;

    row.lines.push({ productId: item.product_id ?? "", jumlah: item.planned_qty });
    row.jumlahUnit += item.planned_qty;
    // Fold rule for a multi-line stop: any unpaid line makes the whole stop
    // unpaid -- the truck loads per stop, and the funded half cannot go
    // without the rest. Otherwise "Kredit" only holds when every line agrees;
    // a stop mixing a credit line with a verified-paid one is fully covered,
    // not on account, so it reads Lunas rather than either extreme alone.
    const lineStatus = statusBayarFor(item.payment_state, item.payment_status, item.invoice_payment_status);
    if (lineStatus === "Belum Lunas" || row.statusBayar === "Belum Lunas") {
      row.statusBayar = "Belum Lunas";
    } else if (lineStatus !== row.statusBayar) {
      row.statusBayar = "Lunas";
    }
    byOutlet.set(outletId, row);
  }

  // By run and position, not alphabetically -- an assigned board is read the
  // way it will be driven, and only a stop with no trip yet falls back to its
  // name (`compareStops`' own tie-break).
  return [...byOutlet.values()].sort(compareStops);
}

/* ── the adapter ───────────────────────────────────────────────────────── */

async function getPlanList(): Promise<DistributionPlan[]> {
  const page = await getList<OrderResponse>("/distribution/orders", {
    pageSize: OPTION_PAGE_SIZE,
    sort: [{ field: "planned_delivery_date", direction: "desc" }],
  });
  return page.items.map(toPlanView);
}

/** Mirrors the backend's distributionorder.HistoryEvent. */
interface HistoryEventResponse {
  at: string;
  user: string;
  event: PlanHistoryEvent["event"];
  succeeded: boolean;
  status_code: number;
  trip_id?: string;
}

async function getPlanHistory(planId: string): Promise<PlanHistoryEvent[]> {
  const rows = await getOne<HistoryEventResponse[]>(`/distribution/orders/${planId}/history`);
  return (rows ?? []).map((row) => ({
    at: row.at,
    user: row.user,
    event: row.event,
    succeeded: row.succeeded,
    statusCode: row.status_code,
    tripId: row.trip_id,
  }));
}

async function getPlan(planId: string): Promise<DistributionPlan> {
  return toPlanView(await getOne<OrderResponse>(`/distribution/orders/${planId}`));
}

async function getPlanDetail(planId: string): Promise<PlanRow[]> {
  const order = await getOne<OrderResponse>(`/distribution/orders/${planId}`);
  // The crew is a second request and a failure of it must not lose the stops:
  // a plan renders perfectly well with "Belum ditetapkan" beside each one, and
  // that is a better answer than an error page for a plan nobody has assigned.
  const board = await getBoard(planId);
  return toPlanRows(order.items ?? [], board);
}

async function getMonthlyGrid(month: string): Promise<DistributionMonthGrid> {
  const wire = await getOne<GridResponse>(`/distribution/grid?month=${encodeURIComponent(month)}`);
  return {
    month: wire.month,
    dates: wire.dates,
    rows: wire.rows.map((row) => ({
      outletId: row.outlet_id,
      outletCode: row.outlet_code,
      outletName: row.outlet_name,
      cells: row.cells,
      targetQty: row.target_qty,
      total: row.total,
      remainingQty: row.remaining_qty,
    })),
    footer: wire.footer.map((day) => ({
      date: day.date,
      planned: day.planned,
      required: day.required,
      hasTarget: day.has_target,
      shortfall: day.shortfall,
    })),
    totals: wire.totals,
  };
}

async function getPaymentBoard(date: string): Promise<DistributionPaymentBoard> {
  const wire = await getOne<PaymentBoardWire>(
    `/distribution/payment-board?date=${encodeURIComponent(date)}`,
  );
  return {
    date: wire.date,
    cutoff: wire.cutoff,
    timezone: wire.timezone,
    rows: wire.rows.map((row) => ({
      outletId: row.outlet_id,
      outletCode: row.outlet_code,
      outletName: row.outlet_name,
      plannedQty: row.planned_qty,
      fundedQty: row.funded_qty,
      unpaidQty: row.unpaid_qty,
      creditQty: row.credit_qty,
      deliveredQty: row.delivered_qty,
      plannedAmount: row.planned_amount,
      fundedAmount: row.funded_amount,
      hasUnpricedLine: row.has_unpriced_line,
      distributionOrderId: row.distribution_order_id,
      planCount: row.plan_count,
      fundingPaymentId: row.funding_payment_id,
      fundingPaymentNumber: row.funding_payment_number,
      state: row.state,
      lastPaymentAt: row.last_payment_at,
      late: row.late,
      hasUnverifiedPayment: row.has_unverified_payment,
    })),
    summary: {
      required: wire.summary.required,
      hasTarget: wire.summary.has_target,
      planned: wire.summary.planned,
      funded: wire.summary.funded,
      unpaid: wire.summary.unpaid,
      delivered: wire.summary.delivered,
      shortfall: wire.summary.shortfall,
      outlets: wire.summary.outlets,
      paidOutlets: wire.summary.paid_outlets,
      lateOutlets: wire.summary.late_outlets,
    },
  };
}

async function getBoard(planId: string): Promise<BoardResponse | undefined> {
  try {
    return await getOne<BoardResponse>(`/distribution/orders/${planId}/trips`);
  } catch {
    return undefined;
  }
}

async function createPlan(input: { tanggal: string; saId: string }): Promise<DistributionPlan> {
  const created = await send<OrderResponse>("post", "/distribution/orders", {
    planned_delivery_date: input.tanggal,
    agreement_id: input.saId || undefined,
    items: [],
  });
  return toPlanView(created);
}

async function createSourcePlan(input: { batchId: string; tanggal: string; notes?: string }): Promise<DistributionPlan> {
  const created = await send<OrderResponse>("post", `/sim3lon-imports/${input.batchId}/plans`, {
    operational_date: input.tanggal,
    notes: input.notes,
  });
  return toPlanView(created);
}

/**
 * Saves the plan's stops, flattening each one back into a line per product.
 *
 * `saId` travels per line because that is the service's model. The rows the
 * screen holds carry the plan's agreement, so it is read from the plan rather
 * than from the row — the day the screen lets a planner pick an agreement per
 * stop, this is the line that changes and nothing else.
 */
async function saveDraft(planId: string, rows: PlanRow[], version: number): Promise<DistributionPlan> {
  const originScope = scopeKey().join("|");
  const plan = await getPlan(planId);
  if (scopeKey().join("|") !== originScope) {
    throw new Error("Perusahaan yang aktif berganti saat rencana dimuat. Buka lagi rencananya dari perusahaan yang benar, lalu simpan.");
  }
  const agreementId = plan.saId;
  if (!agreementId) {
    throw new Error(
      "Rencana ini belum terikat ke SA. Buka kembali rencananya dan pilih SA " +
        "sebelum menambahkan titik singgah.",
    );
  }

  const items = rows.flatMap((row) =>
    row.lines
      .filter((line) => line.productId && line.jumlah > 0)
      .map((line) => ({
        outlet_id: row.outletId,
        product_id: line.productId,
        agreement_id: agreementId,
        planned_qty: line.jumlah,
      })),
  );

  return toPlanView(await send<OrderResponse>("put", `/distribution/orders/${planId}`, { version, items }));
}

async function confirmPlan(planId: string, version: number): Promise<DistributionPlan> {
  return toPlanView(
    await send<OrderResponse>("post", `/distribution/orders/${planId}/confirm`, { version }),
  );
}

async function cancelDistributionPlan(planId: string, version: number): Promise<void> {
  await send("post", `/distribution/orders/${planId}/cancel`, { version });
}

/**
 * Schedules approved orders onto a plan, via `orderApi`'s own real request --
 * not a second copy of it. See `orderApi.http.ts`'s own header for what
 * `/orders/:id/schedule` does and does not do (no plan line is added; a
 * planner still adds it here, through this same feature's own row editor)
 * and for why a batch that fails partway through is no longer atomic the way
 * the mock's `scheduleOrders` is.
 */
export async function addApprovedOrders(planId: string, orderIds: string[]): Promise<number> {
  let scheduled = 0;
  for (const id of orderIds) {
    try {
      await scheduleOneOrder(id, planId);
      scheduled += 1;
    } catch (error) {
      throw new Error(
        `${scheduled} dari ${orderIds.length} pesanan terjadwalkan sebelum gagal: ` +
          `${(error as Error).message}`,
      );
    }
  }
  return scheduled;
}

/* ── option lists for the planner ──────────────────────────────────────── */

async function getOutletOptions(): Promise<PlanOption[]> {
  const page = await getList<OutletResponse>("/outlets", {
    pageSize: OPTION_PAGE_SIZE,
    sort: [{ field: "name" }],
    filters: [{ field: "status", operator: "eq", value: "atv" }],
  });
  return page.items.map((o) => ({
    id: o.id,
    label: o.name,
    sublabel: [o.district && `Kec. ${o.district}`, o.city].filter(Boolean).join(" · ") || o.code,
  }));
}

async function getProductOptions(): Promise<ProductOption[]> {
  const page = await getList<ProductResponse>("/products", {
    pageSize: OPTION_PAGE_SIZE,
    sort: [{ field: "name" }],
    filters: [{ field: "status", operator: "eq", value: "atv" }],
  });
  return page.items.map((p) => ({
    id: p.id,
    label: p.name,
    // The counting noun, from core.units. A product with no unit recorded is
    // shown without one rather than being called a tabung it may not be.
    satuan: p.unit_abbreviation ?? "",
  }));
}

/**
 * The product(s) an agreement is actually for, read from its own quota
 * breakdown -- not the catalogue-wide `getProductOptions()` above, which is
 * unrelated to any agreement and is where a new stop used to default from
 * (whatever sorted first alphabetically, regardless of the plan's SA).
 */
async function getSAProductOptions(saId: string): Promise<ProductOption[]> {
  if (!saId) return [];
  const agreement = await getOne<AgreementDetailResponse>(`/schedule-agreements/${saId}`);
  return (agreement.products ?? []).map((p) => ({
    id: p.product_id,
    label: p.product_name,
    satuan: "",
  }));
}

interface AgreementDetailResponse {
  products?: Array<{ product_id: string; product_name: string }>;
}

interface OutletPlanRowResponse {
  outlet_id: string;
  outlet_name: string;
  product_id: string;
  product_name: string;
  planned_qty: number;
}

/**
 * What the agreement's own SIM3LON import says each outlet should receive on
 * this date -- read straight through, not derived from anything else the
 * console already fetched. See fortius-backend's
 * `saimport.OutletPlanForDate` for where this comes from.
 */
async function getSAOutletPlan(saId: string, tanggal: string): Promise<SAOutletPlanRow[]> {
  if (!saId) return [];
  const rows = await getOne<OutletPlanRowResponse[]>(
    `/schedule-agreements/${saId}/outlet-plan?date=${tanggal}`,
  );
  return (rows ?? []).map((r) => ({
    outletId: r.outlet_id,
    outlet: r.outlet_name,
    productId: r.product_id,
    productName: r.product_name,
    jumlah: r.planned_qty,
  }));
}

/**
 * Drivers with the load already on them, from the plan's own board.
 *
 * Capacity comes from the vehicle the driver is crewed with on this plan, which
 * is why it is read from the board rather than from the driver: a driver has no
 * capacity, a truck does, and the pairing belongs to the run. A driver not yet
 * on any trip is offered with no capacity — the planner can still assign them,
 * and the service settles the vehicle when the assignment is applied.
 */
async function getDriverOptions(planId: string): Promise<DriverOption[]> {
  const [page, board, fleet] = await Promise.all([
    getList<{ id: string; code: string; full_name: string; status: string }>("/drivers", {
      pageSize: OPTION_PAGE_SIZE,
      sort: [{ field: "full_name" }],
      filters: [{ field: "status", operator: "eq", value: "atv" }],
    }),
    getBoard(planId),
    getList<{ capacity_qty: number; operational_status: string }>("/vehicles", {
      pageSize: OPTION_PAGE_SIZE,
      filters: [{ field: "status", operator: "eq", value: "atv" }],
    }),
  ]);

  // The ceiling for a driver nobody has crewed yet.
  //
  // Capacity belongs to the truck, and which truck this driver gets is decided
  // when the run is built — so before that the honest ceiling is the largest
  // one the depot could give them. Zero was the alternative and it was worse
  // than wrong: the planning screen read it as "this driver can carry nothing",
  // reported every stop as an overload, and refused to let the plan be
  // confirmed at all.
  const largest = Math.max(
    0,
    ...fleet.items
      .filter((v) => v.operational_status !== "maintenance")
      .map((v) => v.capacity_qty),
  );

  const crewed = new Map(
    (board?.trips ?? []).map((t) => [
      t.driver_id,
      { plate: t.plate, load: t.load_qty, capacity: t.capacity_qty },
    ]),
  );

  return page.items.map((d) => {
    const trip = crewed.get(d.id);
    return {
      id: d.id,
      label: d.full_name,
      sublabel: trip ? `${trip.plate} · ${d.code}` : d.code,
      kapasitas: trip?.capacity ?? largest,
      muatan: trip?.load ?? 0,
      status: d.status === "atv" ? "Aktif" : d.status,
      disabled: false,
    };
  });
}

async function getVehicleOptions(): Promise<VehicleOption[]> {
  const page = await getList<VehicleResponse>("/vehicles", {
    pageSize: OPTION_PAGE_SIZE,
    sort: [{ field: "plate_number" }],
    filters: [
      { field: "status", operator: "eq", value: "atv" },
      // A truck in the workshop is not one the depot can send out today.
      { field: "operational_status", operator: "eq", value: "available" },
    ],
  });
  return page.items.map((v) => ({
    id: v.id,
    label: v.plate_number,
    sublabel: [v.brand, v.model].filter(Boolean).join(" ") || v.vehicle_type,
    kapasitas: v.capacity_qty,
  }));
}

/**
 * Commits the board.
 *
 * The service replaces the plan's runs wholesale rather than diffing them: a
 * board is edited as a whole and applied as a whole, and a partial apply would
 * leave stops on runs that no longer exist.
 */
async function applyAssignment(planId: string, trips: TripAssignment[], version: number): Promise<void> {
  await send("put", `/distribution/orders/${planId}/assignment`, {
    version,
    trips: trips.map((trip) => ({
      driver_id: trip.driverId,
      vehicle_id: trip.vehicleId,
      trip_no: trip.tripNo,
      stops: trip.stops.map((stop) => ({
        outlet_id: stop.outletId,
        sequence_no: stop.sequenceNo,
      })),
      // Omitted rather than sent empty: the service's own field is optional,
      // and a run can be committed with no schedule at all.
      ...(trip.berangkat ? { planned_departure_time: trip.berangkat } : {}),
    })),
  });
}

interface DispatchResponse {
  trip_id: string;
  issued: unknown[];
}

/**
 * Sends one run out — D3 A-Step 2/3.
 *
 * `credit_overrides` is sent even when empty (`[]`), matching how the
 * backend's own optional-body handling was built: an omitted body and one
 * naming zero overrides are the same request either way, and sending the
 * array explicitly means this call never depends on that equivalence
 * holding.
 */
async function dispatchTrip(
  tripId: string,
  overrides: CreditOverrideInput[] = [],
): Promise<DispatchResult> {
  const response = await send<DispatchResponse>(
    "post",
    `/distribution/trips/${tripId}/dispatch`,
    {
      credit_overrides: overrides.map((o) => ({
        outlet_id: o.outletId,
        second_approver_id: o.secondApproverId,
        reason: o.reason,
      })),
    },
  );
  return { issued: response.issued.length };
}

async function getActiveSaOptions(): Promise<PlanOption[]> {
  const page = await getList<AgreementListResponse>("/schedule-agreements", {
    pageSize: OPTION_PAGE_SIZE,
    sort: [{ field: "period_end", direction: "desc" }],
    filters: [{ field: "sa_status", operator: "eq", value: "active" }],
  });
  return page.items.map((sa) => {
    const sisa = sa.total_quota_qty - sa.allocated_quota_qty;
    return {
      id: sa.id,
      label: sa.sa_number,
      sublabel: `${sa.supplier_name ?? "—"} · sisa ${sisa.toLocaleString("id-ID")}`,
      disabled: sisa <= 0,
    };
  });
}

/**
 * The service's proposal, which orders the stops as well as packing them.
 *
 * `dasar` says so, and it is the one line the two adapters are meant to differ
 * on: the browser packer has no coordinates and says it groups by capacity
 * alone, while this one can honestly claim the route was considered.
 */
async function suggestAssignment(planId: string): Promise<AssignmentSuggestion> {
  const board = await send<BoardResponse>(
    "post",
    `/distribution/orders/${planId}/suggest-assignment`,
  );

  const trips: SuggestedTrip[] = board.trips.map((trip) => ({
    tripNo: trip.trip_no,
    driverId: trip.driver_id,
    driver: trip.driver_name,
    vehicleId: trip.vehicle_id,
    armada: trip.plate,
    kapasitas: trip.capacity_qty,
    muatan: trip.load_qty,
    muatanBerisiko: trip.at_risk_qty,
    stops: trip.stops.map(
      (stop): SuggestedStop => ({
        outletId: stop.outlet_id,
        outlet: stop.outlet_name,
        jumlahUnit: stop.qty,
        urutan: stop.sequence_no,
        lunas: stop.funded,
        eta: stop.eta,
      }),
    ),
    berangkat: trip.planned_departure_time,
  }));

  const unroutable: UnroutableStop[] = board.unroutable.map((stop) => ({
    outletId: stop.outlet_id,
    outlet: stop.outlet_name,
    jumlahUnit: stop.qty,
    alasan: stop.reason,
  }));

  const km = (board.summary.distance_m / 1000).toLocaleString("id-ID", {
    maximumFractionDigits: 1,
  });
  const selesai = board.summary.finish_eta ? `, selesai ± ${board.summary.finish_eta}` : "";
  // Silent when straight-line, which has been the only source this ever had
  // until an on-prem router existed — flagging the ordinary case would just be
  // noise. Road distance is the exception worth telling a dispatcher about,
  // since "± 15 km" reads as a much firmer promise than the haversine estimate
  // it usually is.
  const jarak = board.summary.distance_source === "road" ? " (jarak jalan)" : "";
  return {
    trips,
    unroutable,
    dasar:
      `Dikelompokkan per kapasitas armada dan diurutkan menurut jarak antar ` +
      `${"titik singgah"}: total ± ${km} km${jarak} untuk ${board.summary.trips} rit${selesai}.`,
  };
}

/**
 * Prints the route sheet handed to drivers at the depot.
 *
 * The module header's own gap — no address, no clock time on the order-item
 * response — is only half true now. `getOutletList()` (already real) supplies
 * the address; the clock time still does not exist anywhere in the schema
 * (`toPlanRows`'s own `jamPengiriman: "—"` already says so for the live
 * planning screen), so the sheet shows the same placeholder the screen does
 * rather than inventing one.
 */
export async function printRouteSheet(planId: string): Promise<void> {
  const [plan, rows, settings, outlets] = await Promise.all([
    getPlan(planId),
    getPlanDetail(planId),
    getSettings(),
    getOutletList(),
  ]);
  const outletById = new Map(outlets.map((o) => [o.id, o]));
  const total = rows.reduce((s, r) => s + r.jumlahUnit, 0);
  const fmt = (n: number) => n.toLocaleString("id-ID");
  // By run and stop position -- the order a driver actually drives it in, not
  // merely grouped by trip number with whatever order the rows arrived in.
  const ordered = [...rows].sort(compareStops);

  printDocument(
    `${plan.kode} · Lembar Rute`,
    `
    <p class="eyebrow">${settings.namaPerusahaan} · Agen ${settings.nomorAgen}</p>
    <h1>Lembar Rute Distribusi</h1>
    <hr class="rule" />
    <div class="meta">
      <div>Kode rencana<strong class="code">${plan.kode}</strong></div>
      <div>Tanggal<strong>${new Date(plan.tanggal).toLocaleDateString("id-ID", { weekday: "long", day: "2-digit", month: "long", year: "numeric" })}</strong></div>
      <div>Status<strong>${plan.status}</strong></div>
      <div>Titik singgah<strong>${ordered.length}</strong></div>
    </div>
    <table>
      <thead>
        <tr>
          <th>#</th><th>Jam</th><th>${outletLabelTitle()}</th><th>Alamat</th><th>Driver / Armada</th>
          <th style="text-align:right">${unitLabelTitle()}</th><th style="width:90px">Diterima</th>
        </tr>
      </thead>
      <tbody>
        ${ordered
          .map((r) => {
            const pkl = outletById.get(r.outletId);
            return `<tr>
              <td class="code">${r.urutan ?? "—"}</td>
              <td class="code">${r.jamPengiriman}</td>
              <td>${r.outlet}</td>
              <td>${pkl ? `${pkl.alamat}, Kec. ${pkl.kecamatan}` : "—"}</td>
              <td>${r.driverId ? `${r.driver}<br /><span class="code">${r.vehicle}</span>` : "Belum ditetapkan"}</td>
              <td class="num">${fmt(r.jumlahUnit)}</td>
              <td></td>
            </tr>`;
          })
          .join("")}
      </tbody>
      <tfoot><tr><td colspan="5">Total muatan</td><td class="num">${fmt(total)}</td><td></td></tr></tfoot>
    </table>
    <div class="sign">
      <div>Petugas gudang<span></span></div>
      <div>Koordinator distribusi<span>${plan.dikonfirmasiOleh ?? ""}</span></div>
    </div>`,
  );
}

export const distributionApiHttp: DistributionApi = {
  getPlanList,
  getPlan,
  getPlanHistory,
  getPlanDetail,
  getMonthlyGrid,
  getPaymentBoard,
  createPlan,
  createSourcePlan,
  saveDraft,
  confirmPlan,
  cancelDistributionPlan,
  getOutletOptions,
  getProductOptions,
  getSAProductOptions,
  getDriverOptions,
  getVehicleOptions,
  getActiveSaOptions,
  getSAOutletPlan,
  suggestAssignment,
  applyAssignment,
  dispatchTrip,
};
